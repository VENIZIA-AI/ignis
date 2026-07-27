import { getError } from '@/modules/error';
import { AbstractSecretsHelper } from '../base';
import type { IClock, ISecretLease, ITimerAdapter } from '../common';

export class SystemEnvsHelper extends AbstractSecretsHelper {
  constructor(opts: { identifier?: string; clock?: IClock; timers?: ITimerAdapter }) {
    super({
      scope: SystemEnvsHelper.name,
      identifier: opts.identifier,
      clock: opts.clock,
      timers: opts.timers,
    });
  }

  protected async fetchRaw() {
    const value: Record<string, string> = {};
    for (const [key, raw] of Object.entries(process.env)) {
      if (raw !== undefined) {
        value[key] = raw;
      }
    }
    return { value };
  }

  protected async renewRaw() {
    return null;
  }

  protected async revokeRaw() {
    // no-op
  }

  override async lease(_opts: { path: string; key: string }): Promise<ISecretLease> {
    throw getError({
      message:
        '[SystemEnvsHelper.lease] Dynamic leases are not supported by the system-envs provider',
    });
  }
}
