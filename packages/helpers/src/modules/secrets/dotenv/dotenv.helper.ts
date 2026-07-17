import type { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import { importOptionalModule } from '@/utilities/module.utility';
import { AbstractSecretsHelper } from '../base';
import type { IClock, ISecretLease, ITimerAdapter } from '../common';

export interface IDotenvVaultHelperOptions {
  path?: string;
  dotenvKey?: string;
  identifier?: string;
  cacheTtlSeconds?: number;
  clock?: IClock;
  timers?: ITimerAdapter;
  /** Injection seam for tests; production decrypts via @dotenvx/dotenvx. */
  decode?: (opts: { path: string; dotenvKey?: string }) => Record<string, string>;
}

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
    const dotenvx = await importOptionalModule<AnyType>({ module: '@dotenvx/dotenvx' });
    const result = dotenvx.config({
      path: this.path,
      ...(this.dotenvKey ? { DOTENV_KEY: this.dotenvKey } : {}),
      overload: true,
    });
    const parsed = (result?.parsed ?? {}) as Record<string, string>;
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
