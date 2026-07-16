import { readFile } from 'node:fs/promises';
import type { AnyObject, AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import { AbstractSecretsHelper } from '../base';
import { VaultAuthMethods, type IClock, type ITimerAdapter, type TTimerHandle } from '../common';
import { vaultAuthSchema, type TVaultAuth } from './auth';

// node-vault's wire contract for approleLogin/kubernetesLogin/write/token-lifecycle bodies and
// responses uses snake_case field names (role_id, secret_id, mount_point, lease_id,
// client_token, lease_duration, ttl, ...); those are built/read via bracket-notation on AnyObject
// below rather than typed object-literal properties, so the snake_case stays confined to this
// boundary instead of leaking into our camelCase-only typing convention.
interface TVaultClient {
  token: string;
  read(path: string): Promise<AnyType>;
  write(path: string, data: AnyObject): Promise<AnyType>;
  approleLogin(opts: AnyObject): Promise<AnyType>;
  kubernetesLogin?(opts: AnyObject): Promise<AnyType>;
  tokenRenewSelf(): Promise<AnyType>;
  tokenLookupSelf(): Promise<AnyType>;
}

export interface IHashiCorpVaultHelperOptions {
  endpoint: string;
  auth: TVaultAuth;
  identifier?: string;
  cacheTtlSeconds?: number;
  renewBeforeRatio?: number;
  clock?: IClock;
  timers?: ITimerAdapter;
  /** Injection seam for tests; production builds the real node-vault client in configure(). */
  client?: TVaultClient;
}

export class HashiCorpVaultHelper extends AbstractSecretsHelper {
  private static readonly TOKEN_RENEWAL_RETRY_BASE_SECONDS = 1;
  private static readonly TOKEN_RENEWAL_RETRY_CAP_SECONDS = 60;

  private readonly endpoint: string;
  private readonly auth: TVaultAuth;
  private client?: TVaultClient;
  private tokenTimer?: TTimerHandle;
  private tokenRenewalRetryCount = 0;

  constructor(opts: IHashiCorpVaultHelperOptions) {
    super({
      scope: HashiCorpVaultHelper.name,
      identifier: opts.identifier,
      cacheTtlSeconds: opts.cacheTtlSeconds,
      renewBeforeRatio: opts.renewBeforeRatio,
      clock: opts.clock,
      timers: opts.timers,
    });
    this.endpoint = opts.endpoint;
    try {
      this.auth = vaultAuthSchema.parse(opts.auth);
    } catch (error) {
      throw getError({
        message: `[HashiCorpVaultHelper] Invalid Vault auth configuration | ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
    this.client = opts.client;
  }

  override async configure(): Promise<void> {
    const logger = this.logger.for(this.configure.name);
    if (!this.client) {
      const factory = (await import('node-vault')).default as AnyType;
      this.client = factory({ endpoint: this.endpoint, apiVersion: 'v1' }) as TVaultClient;
    }
    const { ttlSeconds, renewable } = await this.login();
    if (renewable && ttlSeconds > 0) {
      this.scheduleTokenRenewal({ ttlSeconds });
    }
    logger.info('Vault authenticated | endpoint: %s | method: %s', this.endpoint, this.auth.method);
  }

  override async shutdown(): Promise<void> {
    if (this.tokenTimer) {
      this.timers.clear(this.tokenTimer);
      this.tokenTimer = undefined;
    }
    await super.shutdown();
  }

  private requireClient(): TVaultClient {
    if (!this.client) {
      throw getError({ message: '[HashiCorpVaultHelper] configure() must run before use' });
    }
    return this.client;
  }

  /** Authenticates against Vault and returns the resulting token's TTL/renewability so callers can schedule self-renewal. */
  private async login(): Promise<{ ttlSeconds: number; renewable: boolean }> {
    const client = this.requireClient();

    switch (this.auth.method) {
      case VaultAuthMethods.TOKEN: {
        client.token = this.auth.token;
        const res = await client.tokenLookupSelf();
        return {
          ttlSeconds: Number(res?.data?.['ttl'] ?? 0),
          renewable: Boolean(res?.data?.['renewable']),
        };
      }
      case VaultAuthMethods.APP_ROLE: {
        const payload: AnyObject = {};
        payload['role_id'] = this.auth.roleId;
        payload['secret_id'] = this.auth.secretId;
        payload['mount_point'] = this.auth.mountPath ?? 'approle';
        const res = await client.approleLogin(payload);
        client.token = res.auth['client_token'];
        return {
          ttlSeconds: Number(res.auth['lease_duration'] ?? 0),
          renewable: Boolean(res.auth['renewable']),
        };
      }
      case VaultAuthMethods.KUBERNETES: {
        if (!client.kubernetesLogin) {
          throw getError({
            message: '[HashiCorpVaultHelper.login] node-vault client lacks kubernetesLogin',
          });
        }
        const jwt = (
          await readFile(
            this.auth.jwtPath ?? '/var/run/secrets/kubernetes.io/serviceaccount/token',
            'utf8',
          )
        ).trimEnd();
        const payload: AnyObject = { role: this.auth.role, jwt };
        payload['mount_point'] = this.auth.mountPath ?? 'kubernetes';
        const res = await client.kubernetesLogin(payload);
        client.token = res.auth['client_token'];
        return {
          ttlSeconds: Number(res.auth['lease_duration'] ?? 0),
          renewable: Boolean(res.auth['renewable']),
        };
      }
      default: {
        throw getError({ message: '[HashiCorpVaultHelper.login] Unsupported auth method' });
      }
    }
  }

  private scheduleTokenRenewal(opts: { ttlSeconds: number }): void {
    if (this.tokenTimer) {
      this.timers.clear(this.tokenTimer);
    }
    const delayMs = Math.max(0, opts.ttlSeconds * this.renewBeforeRatio * 1000);
    this.tokenTimer = this.timers.set(() => {
      this.handleTokenRenewal().catch(error => {
        this.logger
          .for(this.scheduleTokenRenewal.name)
          .error('Token renewal handler crashed | error: %s', error);
      });
    }, delayMs);
  }

  /**
   * Re-auth inside the renewal timer can hit a transient blip and throw. Without a reschedule the
   * token silently expires and every read 403s with no recovery, so mirror the lease-renewal safety
   * net: a capped exponential backoff that keeps retrying the whole renewal chain until it succeeds.
   */
  private scheduleTokenRenewalRetry(): void {
    if (this.tokenTimer) {
      this.timers.clear(this.tokenTimer);
    }
    this.tokenRenewalRetryCount += 1;
    const backoffSeconds = Math.min(
      HashiCorpVaultHelper.TOKEN_RENEWAL_RETRY_CAP_SECONDS,
      HashiCorpVaultHelper.TOKEN_RENEWAL_RETRY_BASE_SECONDS *
        2 ** (this.tokenRenewalRetryCount - 1),
    );
    this.tokenTimer = this.timers.set(() => {
      this.handleTokenRenewal().catch(error => {
        this.logger
          .for(this.scheduleTokenRenewalRetry.name)
          .error('Token renewal retry handler crashed | error: %s', error);
      });
    }, backoffSeconds * 1000);
  }

  private async handleTokenRenewal(): Promise<void> {
    const logger = this.logger.for(this.handleTokenRenewal.name);

    try {
      const res = await this.requireClient().tokenRenewSelf();
      const ttlSeconds = Number(res?.auth?.['lease_duration'] ?? 0);
      const renewable = Boolean(res?.auth?.['renewable']);
      if (renewable && ttlSeconds > 0) {
        this.tokenRenewalRetryCount = 0;
        this.scheduleTokenRenewal({ ttlSeconds });
        return;
      }
      logger.warn('Token renewal returned a non-renewable/expired token; re-authenticating');
    } catch (error) {
      logger.warn('Token renewal failed; re-authenticating | error: %s', error);
    }

    try {
      const { ttlSeconds, renewable } = await this.login();
      this.tokenRenewalRetryCount = 0;
      if (renewable && ttlSeconds > 0) {
        this.scheduleTokenRenewal({ ttlSeconds });
      }
    } catch (error) {
      logger.error('Token re-authentication failed; scheduling bounded retry | error: %s', error);
      this.scheduleTokenRenewalRetry();
    }
  }

  protected async fetchRaw(opts: { path: string }) {
    const res = await this.requireClient().read(opts.path);
    const nested = res?.['data']?.['data'];
    const inner = nested && typeof nested === 'object' ? nested : res?.['data'];
    const value: Record<string, string> = {};
    for (const [key, raw] of Object.entries(inner ?? {})) {
      value[key] = typeof raw === 'string' ? raw : JSON.stringify(raw);
    }
    const leaseId = res?.['lease_id'];
    if (leaseId) {
      return {
        value,
        lease: {
          leaseId,
          ttlSeconds: res['lease_duration'] ?? 0,
          renewable: Boolean(res['renewable']),
        },
      };
    }
    return { value };
  }

  protected async renewRaw(opts: { leaseId: string; ttlSeconds: number }) {
    const logger = this.logger.for(this.renewRaw.name);
    try {
      const payload: AnyObject = { increment: opts.ttlSeconds };
      payload['lease_id'] = opts.leaseId;
      const res = await this.requireClient().write('sys/leases/renew', payload);
      return { ttlSeconds: res['lease_duration'] ?? opts.ttlSeconds };
    } catch (error) {
      logger.warn('Renew rejected | leaseId: %s | error: %s', opts.leaseId, error);
      return null;
    }
  }

  protected async revokeRaw(opts: { leaseId: string }) {
    const payload: AnyObject = {};
    payload['lease_id'] = opts.leaseId;
    await this.requireClient().write('sys/leases/revoke', payload);
  }
}
