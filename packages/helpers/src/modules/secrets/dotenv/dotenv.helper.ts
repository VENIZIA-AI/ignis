import { getError } from '@/modules/error';
import { ModuleUtility } from '@/utilities/module.utility';
import { AbstractSecretsHelper } from '../base';
import type { IClock, ISecretLease, ITimerAdapter } from '../common';

/** The part of `@dotenvx/dotenvx` this helper calls: `config` loads and decrypts the vault file. */
interface IDotenvxModule {
  config(opts: {
    path: string;
    DOTENV_KEY?: string;
    overload: boolean;
  }): { parsed?: Record<string, string> } | undefined;
}

/** Options for `DotenvVaultHelper`. `dotenvKey` is the decryption key passed to dotenvx when set. */
export interface IDotenvVaultHelperOptions {
  /** @default '.env.vault' */
  path?: string;
  dotenvKey?: string;
  identifier?: string;
  /**
   * TTL in seconds of the get/getBundle cache.
   *
   * @default 300
   */
  cacheTtlSeconds?: number;
  clock?: IClock;
  timers?: ITimerAdapter;
  /** Injection seam for tests; production decrypts via @dotenvx/dotenvx. */
  decode?: (opts: { path: string; dotenvKey?: string }) => Record<string, string>;
}

/** Secrets provider that decrypts a dotenv vault file with `@dotenvx/dotenvx` and serves its entries. Dynamic leases are not supported: `lease()` throws. */
export class DotenvVaultHelper extends AbstractSecretsHelper {
  private readonly path: string;
  private readonly dotenvKey?: string;
  private readonly decode?: IDotenvVaultHelperOptions['decode'];

  constructor(opts: IDotenvVaultHelperOptions) {
    super({
      scope: DotenvVaultHelper.name,
      identifier: opts.identifier,
      cacheTtlSeconds: opts.cacheTtlSeconds,
      clock: opts.clock,
      timers: opts.timers,
    });
    this.path = opts.path ?? '.env.vault';
    this.dotenvKey = opts.dotenvKey;
    this.decode = opts.decode;
  }

  protected async fetchRaw() {
    if (this.decode) {
      return { value: this.decode({ path: this.path, dotenvKey: this.dotenvKey }) };
    }

    const dotenvx = await ModuleUtility.load<IDotenvxModule>({ module: '@dotenvx/dotenvx' });
    const result = dotenvx.config({
      path: this.path,
      ...(this.dotenvKey ? { DOTENV_KEY: this.dotenvKey } : {}),
      overload: true,
    });
    const parsed = result?.parsed ?? {};

    return { value: parsed };
  }

  protected async renewRaw() {
    return null;
  }

  protected async revokeRaw() {
    return;
  }

  override async lease(_opts: { path: string; key: string }): Promise<ISecretLease> {
    throw getError({
      message:
        '[DotenvVaultHelper.lease] Dynamic leases are not supported by the dotenv-vault provider',
    });
  }
}
