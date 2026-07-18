import type { AnyType } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import type {
  IClock,
  IGetSecretOptions,
  ISecretLease,
  ISecretRotatable,
  ISecretRotationEvent,
  ISecretsHelper,
  ISecretsHelperOptions,
  ITimerAdapter,
  TSecretRotationHandler,
  TTimerHandle,
} from '../common';

interface ICacheEntry {
  value: Record<string, string>;
  expiresAt: number;
}

interface IRawFetchResult {
  value: Record<string, string>;
  lease?: { leaseId: string; ttlSeconds: number; renewable: boolean };
}

const DEFAULT_CLOCK: IClock = { now: () => Date.now() };
const DEFAULT_TIMERS: ITimerAdapter = {
  set: (handler, ms) => setTimeout(handler, ms),
  clear: handle => clearTimeout(handle as AnyType),
};

const DEFAULT_CACHE_TTL_SECONDS = 300;
const DEFAULT_RENEW_BEFORE_RATIO = 0.66;

// setTimeout coerces any delay above this to 1ms, triggering an immediate renewal storm.
const TIMEOUT_MAX_MS = 2_147_483_647;
// Floor so an invalid/tiny ttl never becomes a 0ms busy-loop.
const MIN_RENEW_DELAY_MS = 1_000;
// Bounded exponential backoff for the renewal retry loop when Vault is unreachable.
const BACKOFF_BASE_MS = 1_000;
// Capped at 31 to keep 2 ** (attempt - 1) inside double range: past ~1024 it overflows to Infinity,
// and clampDelayMs's non-finite branch returns the FLOOR - collapsing a long backoff into a 1/sec
// retry storm. (2 ** 30 * BACKOFF_BASE_MS already exceeds TIMEOUT_MAX_MS regardless.)
const MAX_BACKOFF_ATTEMPT_EXPONENT = 31;

export abstract class AbstractSecretsHelper extends BaseHelper implements ISecretsHelper {
  protected readonly clock: IClock;
  protected readonly timers: ITimerAdapter;
  protected readonly cacheTtlSeconds: number;
  protected readonly renewBeforeRatio: number;

  private readonly cache = new Map<string, ICacheEntry>();
  private readonly leases = new Map<string, ISecretLease>();
  private readonly leasePaths = new Map<string, string>();
  private readonly timerHandles = new Map<string, TTimerHandle>();
  private readonly rotatables = new Map<string, ISecretRotatable[]>();
  private readonly rotateHandlers: TSecretRotationHandler[] = [];
  private readonly backoffAttempts = new Map<string, number>();
  private closed = false;

  constructor(opts: ISecretsHelperOptions) {
    super({ scope: opts.scope, identifier: opts.identifier });
    this.clock = opts.clock ?? DEFAULT_CLOCK;
    this.timers = opts.timers ?? DEFAULT_TIMERS;
    this.cacheTtlSeconds = opts.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;

    const ratio = opts.renewBeforeRatio ?? DEFAULT_RENEW_BEFORE_RATIO;
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
      throw getError({
        message: `[constructor] renewBeforeRatio must be within (0, 1] | received: ${ratio}`,
      });
    }
    this.renewBeforeRatio = ratio;
  }

  protected abstract fetchRaw(opts: { path: string }): Promise<IRawFetchResult>;
  protected abstract renewRaw(opts: {
    leaseId: string;
    ttlSeconds: number;
  }): Promise<{ ttlSeconds: number } | null>;
  protected abstract revokeRaw(opts: { leaseId: string }): Promise<void>;

  // Concrete providers override to authenticate; default is a no-op.
  async configure(): Promise<void> {
    return;
  }

  async getBundle(opts: { path: string }): Promise<Record<string, string>> {
    this.evictExpiredCache();
    const cached = this.cache.get(opts.path);
    if (cached && cached.expiresAt > this.clock.now()) {
      return cached.value;
    }
    const fresh = await this.fetchRaw({ path: opts.path });
    // A shutdown that ran while fetchRaw was in flight already cleared `cache` - honor that and
    // hand back the fetched value uncached rather than resurrecting a map shutdown just emptied.
    if (this.closed) {
      return fresh.value;
    }
    this.writeCache({ path: opts.path, value: fresh.value });
    return fresh.value;
  }

  async get(opts: IGetSecretOptions<string>): Promise<string>;
  async get<TValue>(opts: IGetSecretOptions<TValue>): Promise<TValue>;
  async get<TValue = string>(opts: IGetSecretOptions<TValue>): Promise<TValue> {
    const bundle = await this.getBundle({ path: opts.path });
    const raw = opts.key ? bundle[opts.key] : (bundle as AnyType);
    return (raw ?? opts.defaultValue) as TValue;
  }

  async lease(opts: { path: string; key: string }): Promise<ISecretLease> {
    const fresh = await this.fetchRaw({ path: opts.path });
    // A shutdown that ran while fetchRaw was in flight already revoked/cleared every lease -
    // committing this one now would resurrect leases/leasePaths with a lease no live provider
    // will ever renew or revoke, so surface the shutdown instead of silently leaking it back in.
    if (this.closed) {
      throw getError({
        message: `[lease] Provider is shut down | path: ${opts.path} | key: ${opts.key}`,
      });
    }
    if (!fresh.lease) {
      throw getError({
        message: `[lease] Path returned no lease | path: ${opts.path} | key: ${opts.key}`,
      });
    }
    const lease: ISecretLease = { value: fresh.value, ...fresh.lease };
    this.leases.set(opts.key, lease);
    this.leasePaths.set(opts.key, opts.path);
    this.scheduleRenewal({ key: opts.key, lease });
    return lease;
  }

  onRotate(handler: TSecretRotationHandler): void {
    this.rotateHandlers.push(handler);
  }

  registerRotatable(opts: { key: string; target: ISecretRotatable }): void {
    const list = this.rotatables.get(opts.key) ?? [];
    list.push(opts.target);
    this.rotatables.set(opts.key, list);
  }

  async shutdown(): Promise<void> {
    const logger = this.logger.for(this.shutdown.name);
    this.closed = true;

    for (const handle of this.timerHandles.values()) {
      this.timers.clear(handle);
    }
    this.timerHandles.clear();
    this.backoffAttempts.clear();

    for (const [key, lease] of this.leases) {
      try {
        await this.revokeRaw({ leaseId: lease.leaseId });
      } catch (error) {
        logger.error(
          'Revoke failed | key: %s | leaseId: %s | error: %s',
          key,
          lease.leaseId,
          error,
        );
      }
    }
    this.leases.clear();
    this.leasePaths.clear();
    this.cache.clear();
  }

  private writeCache(opts: { path: string; value: Record<string, string> }): void {
    this.cache.set(opts.path, {
      value: opts.value,
      expiresAt: this.clock.now() + this.cacheTtlSeconds * 1000,
    });
  }

  private evictExpiredCache(): void {
    const now = this.clock.now();
    for (const [path, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(path);
      }
    }
  }

  private clampDelayMs(opts: { delayMs: number }): number {
    if (!Number.isFinite(opts.delayMs) || opts.delayMs <= 0) {
      return MIN_RENEW_DELAY_MS;
    }
    return Math.min(Math.max(opts.delayMs, MIN_RENEW_DELAY_MS), TIMEOUT_MAX_MS);
  }

  private armTimer(opts: { key: string; delayMs: number }): void {
    const existing = this.timerHandles.get(opts.key);
    if (existing) {
      this.timers.clear(existing);
    }
    const handle = this.timers.set(() => {
      this.handleRenewal({ key: opts.key }).catch(error => {
        this.logger
          .for(this.armTimer.name)
          .error('Renewal handler crashed | key: %s | error: %s', opts.key, error);
      });
    }, opts.delayMs);
    this.timerHandles.set(opts.key, handle);
  }

  private scheduleRenewal(opts: { key: string; lease: ISecretLease }): void {
    if (this.closed) {
      return;
    }
    this.backoffAttempts.delete(opts.key);
    const delayMs = this.clampDelayMs({
      delayMs: opts.lease.ttlSeconds * this.renewBeforeRatio * 1000,
    });
    this.armTimer({ key: opts.key, delayMs });
  }

  // A transient Vault failure must not kill the loop; retry with bounded exponential backoff.
  private scheduleBackoffRetry(opts: { key: string }): void {
    if (this.closed) {
      return;
    }
    const attempt = (this.backoffAttempts.get(opts.key) ?? 0) + 1;
    this.backoffAttempts.set(opts.key, attempt);
    const cappedAttempt = Math.min(attempt, MAX_BACKOFF_ATTEMPT_EXPONENT);
    const delayMs = this.clampDelayMs({ delayMs: BACKOFF_BASE_MS * 2 ** (cappedAttempt - 1) });
    this.armTimer({ key: opts.key, delayMs });
  }

  private async handleRenewal(opts: { key: string }): Promise<void> {
    if (this.closed) {
      return;
    }
    const logger = this.logger.for(this.handleRenewal.name);
    const lease = this.leases.get(opts.key);
    if (!lease) {
      logger.debug('No lease to renew | key: %s', opts.key);
      return;
    }
    try {
      if (lease.renewable) {
        const renewed = await this.renewRaw({
          leaseId: lease.leaseId,
          ttlSeconds: lease.ttlSeconds,
        });
        if (this.closed) {
          return;
        }
        if (renewed) {
          const next: ISecretLease = { ...lease, ttlSeconds: renewed.ttlSeconds };
          this.leases.set(opts.key, next);
          this.scheduleRenewal({ key: opts.key, lease: next });
          return;
        }
      }
      await this.rotate({ key: opts.key });
    } catch (error) {
      if (this.closed) {
        return;
      }
      logger.error(
        'Renewal cycle failed; scheduling backoff retry | key: %s | error: %s',
        opts.key,
        error,
      );
      this.scheduleBackoffRetry({ key: opts.key });
    }
  }

  private async rotate(opts: { key: string }): Promise<void> {
    const path = this.leasePaths.get(opts.key);
    if (!path) {
      throw getError({ message: `[rotate] No lease path registered | key: ${opts.key}` });
    }
    const fresh = await this.fetchRaw({ path });
    if (this.closed) {
      return;
    }
    if (!fresh.lease) {
      throw getError({ message: `[rotate] Path returned no lease on rotation | key: ${opts.key}` });
    }
    const lease: ISecretLease = { value: fresh.value, ...fresh.lease };
    this.leases.set(opts.key, lease);
    this.writeCache({ path, value: fresh.value });
    // Arm the next renewal BEFORE dispatching: a wedged consumer must not stall the loop.
    this.scheduleRenewal({ key: opts.key, lease });
    await this.dispatchRotation({ key: opts.key, lease });
  }

  private async dispatchRotation(event: ISecretRotationEvent): Promise<void> {
    const logger = this.logger.for(this.dispatchRotation.name);
    for (const handler of this.rotateHandlers) {
      try {
        await handler(event);
      } catch (error) {
        logger.error('onRotate handler failed | key: %s | error: %s', event.key, error);
      }
    }
    const targets = this.rotatables.get(event.key) ?? [];
    for (const target of targets) {
      try {
        await target.onSecretRotated({ key: event.key, secret: event.lease.value });
      } catch (error) {
        logger.error('Rotatable failed | key: %s | error: %s', event.key, error);
      }
    }
  }
}
