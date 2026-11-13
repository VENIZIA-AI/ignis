import { readFile } from 'node:fs/promises';
import { getError } from '@/modules/error';
import { ModuleUtility } from '@/utilities/module.utility';
import { AbstractSecretsHelper } from '../base';
import { VaultAuthMethods, type IClock, type ITimerAdapter, type TTimerHandle } from '../common';
import { vaultAuthSchema, type TVaultAuth } from './auth';

// node-vault's wire contract uses snake_case (role_id, secret_id, client_token, lease_duration, ...); built/read via bracket-notation on a record here so the snake_case stays confined to this boundary instead of leaking into our camelCase-only typing convention.
/** What Vault answers is the body node-vault passes on: nothing is assumed of it, each key is read and narrowed where it is used. */
interface TVaultClient {
  token: string;
  read(path: string): Promise<unknown>;
  write(path: string, data: Record<string, unknown>): Promise<unknown>;
  approleLogin(opts: Record<string, unknown>): Promise<unknown>;
  kubernetesLogin?(opts: Record<string, unknown>): Promise<unknown>;
  tokenRenewSelf(): Promise<unknown>;
  tokenLookupSelf(): Promise<unknown>;
}

/** The object a Vault answer is, or an empty one: a body that is not an object reads as no keys. */
const toRecord = (value: unknown): Record<string, unknown> => {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
};

/** The nested object under `key` of a Vault answer, or an empty one. */
const readRecord = (opts: { source: unknown; key: string }): Record<string, unknown> => {
  return toRecord(toRecord(opts.source)[opts.key]);
};

/** Options for `HashiCorpVaultHelper`. `auth` is validated on construction; `client` replaces the `node-vault` client the helper would otherwise create. */
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

/** Secrets provider backed by HashiCorp Vault via `node-vault`. `configure()` must run before use; it logs in and schedules renewal of the Vault token when the token is renewable. */
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
      const result = await ModuleUtility.load<{
        default: (opts: { endpoint: string; apiVersion: string }) => TVaultClient;
      }>({
        module: 'node-vault',
      });
      this.client = result.default({ endpoint: this.endpoint, apiVersion: 'v1' });
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

  /** The `client_token` of a login answer: a login that carries none is refused, where an undefined token would fail on the first read. */
  private static readClientToken(opts: { auth: Record<string, unknown> }): string {
    const token = opts.auth['client_token'];

    if (typeof token !== 'string' || !token) {
      throw getError({ message: '[HashiCorpVaultHelper.login] Vault answered no client_token' });
    }

    return token;
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
        const answer = await client.tokenLookupSelf();
        const data = readRecord({ source: answer, key: 'data' });

        return {
          ttlSeconds: Number(data['ttl'] ?? 0),
          renewable: Boolean(data['renewable']),
        };
      }
      case VaultAuthMethods.APP_ROLE: {
        const payload: Record<string, unknown> = {};
        payload['role_id'] = this.auth.roleId;
        payload['secret_id'] = this.auth.secretId;
        payload['mount_point'] = this.auth.mountPath ?? 'approle';
        const answer = await client.approleLogin(payload);
        const auth = readRecord({ source: answer, key: 'auth' });
        client.token = HashiCorpVaultHelper.readClientToken({ auth });

        return {
          ttlSeconds: Number(auth['lease_duration'] ?? 0),
          renewable: Boolean(auth['renewable']),
        };
      }
      case VaultAuthMethods.KUBERNETES: {
        if (!client.kubernetesLogin) {
          throw getError({
            message: '[HashiCorpVaultHelper.login] node-vault client lacks kubernetesLogin',
          });
        }

        const result = await readFile(
          this.auth.jwtPath ?? '/var/run/secrets/kubernetes.io/serviceaccount/token',
          'utf8',
        );
        const jwt = result.trimEnd();
        const payload: Record<string, unknown> = { role: this.auth.role, jwt };
        payload['mount_point'] = this.auth.mountPath ?? 'kubernetes';
        const answer = await client.kubernetesLogin(payload);
        const auth = readRecord({ source: answer, key: 'auth' });
        client.token = HashiCorpVaultHelper.readClientToken({ auth });

        return {
          ttlSeconds: Number(auth['lease_duration'] ?? 0),
          renewable: Boolean(auth['renewable']),
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
      this.handleTokenRenewal().catch((error) => {
        this.logger
          .for(this.scheduleTokenRenewal.name)
          .error('Token renewal handler crashed | error: %s', error);
      });
    }, delayMs);
  }

  /** Without a reschedule here, a transient re-auth failure lets the token expire silently with no recovery - retry with the same capped exponential backoff as lease renewal. */
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
      this.handleTokenRenewal().catch((error) => {
        this.logger
          .for(this.scheduleTokenRenewalRetry.name)
          .error('Token renewal retry handler crashed | error: %s', error);
      });
    }, backoffSeconds * 1000);
  }

  private async handleTokenRenewal(): Promise<void> {
    const logger = this.logger.for(this.handleTokenRenewal.name);

    try {
      const answer = await this.requireClient().tokenRenewSelf();
      const auth = readRecord({ source: answer, key: 'auth' });
      const ttlSeconds = Number(auth['lease_duration'] ?? 0);
      const renewable = Boolean(auth['renewable']);

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
    const data = readRecord({ source: res, key: 'data' });
    const nested = data['data'];
    const inner = nested && typeof nested === 'object' ? toRecord(nested) : data;
    const value: Record<string, string> = {};
    const innerEntries = Object.entries(inner);

    for (const [key, raw] of innerEntries) {
      value[key] = typeof raw === 'string' ? raw : JSON.stringify(raw);
    }

    const lease = toRecord(res);
    const leaseId = lease['lease_id'];

    if (typeof leaseId === 'string' && leaseId) {
      return {
        value,
        lease: {
          leaseId,
          ttlSeconds: Number(lease['lease_duration'] ?? 0),
          renewable: Boolean(lease['renewable']),
        },
      };
    }

    return { value };
  }

  protected async renewRaw(opts: { leaseId: string; ttlSeconds: number }) {
    const logger = this.logger.for(this.renewRaw.name);

    try {
      const payload: Record<string, unknown> = { increment: opts.ttlSeconds };
      payload['lease_id'] = opts.leaseId;
      const res = await this.requireClient().write('sys/leases/renew', payload);

      return { ttlSeconds: Number(toRecord(res)['lease_duration'] ?? opts.ttlSeconds) };
    } catch (error) {
      logger.warn('Renew rejected | leaseId: %s | error: %s', opts.leaseId, error);

      return null;
    }
  }

  protected async revokeRaw(opts: { leaseId: string }) {
    const payload: Record<string, unknown> = {};
    payload['lease_id'] = opts.leaseId;
    await this.requireClient().write('sys/leases/revoke', payload);
  }
}
