import type { TConstValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** How the app reaches Supabase. Direct and session pooler are 5432; transaction pooler is 6543. */
export class PoolerModes extends ConstClass {
  static readonly DIRECT = 'direct';
  static readonly SESSION = 'session';
  static readonly TRANSACTION = 'transaction';
}

/** One of the {@link PoolerModes} values. */
export type TPoolerMode = TConstValue<typeof PoolerModes>;

/** postgres-js client options derived from a pooler mode; `prepare` is the server-side prepared-statements switch. */
export interface IPostgresJsOptions {
  prepare: boolean;
  max?: number;
}

/** Derives postgres-js options for connecting to Supabase through its direct, session or transaction pooler. */
export class SupabasePooler {
  /** Supavisor's TRANSACTION mode rebinds the backend connection per transaction, so server-side prepared statements do not survive - `prepare: false` is required there, not a tuning knob. `max` is forwarded only when supplied; postgres-js has its own default. */
  static buildPostgresJsOptions(opts: { mode: TPoolerMode; max?: number }): IPostgresJsOptions {
    const { mode, max } = opts;

    if (!PoolerModes.isValid(mode)) {
      throw getError({
        message: `[buildPostgresJsOptions] Unknown pooler mode '${mode}' | Expected one of: ${PoolerModes.values().join(', ')}`,
      });
    }

    const options: IPostgresJsOptions = { prepare: mode !== PoolerModes.TRANSACTION };

    if (max !== undefined) {
      options.max = max;
    }

    return options;
  }
}
