import type { TConstValue } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

/** How the app reaches Supabase. Direct and session pooler are 5432; transaction pooler is 6543. */
export class PoolerModes {
  static readonly DIRECT = 'direct';
  static readonly SESSION = 'session';
  static readonly TRANSACTION = 'transaction';

  static readonly SCHEME_SET = new Set<string>([this.DIRECT, this.SESSION, this.TRANSACTION]);

  static isValid(value: string): value is TPoolerMode {
    return this.SCHEME_SET.has(value);
  }
}

export type TPoolerMode = TConstValue<typeof PoolerModes>;

export interface IPostgresJsOptions {
  prepare: boolean;
  max?: number;
}

/** Supavisor's TRANSACTION mode rebinds the backend connection per transaction, so server-side prepared statements do not survive - `prepare: false` is required there, not a tuning knob. `max` is forwarded only when supplied; postgres-js has its own default. */
export const buildPostgresJsOptions = (opts: {
  mode: TPoolerMode;
  max?: number;
}): IPostgresJsOptions => {
  const { mode, max } = opts;

  if (!PoolerModes.isValid(mode)) {
    throw getError({
      message: `[buildPostgresJsOptions] Unknown pooler mode '${mode}' | Expected one of: ${[...PoolerModes.SCHEME_SET].join(', ')}`,
    });
  }

  const options: IPostgresJsOptions = { prepare: mode !== PoolerModes.TRANSACTION };

  if (max !== undefined) {
    options.max = max;
  }

  return options;
};
