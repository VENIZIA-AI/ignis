import type { TConstValue } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';

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

/**
 * Supavisor's TRANSACTION pool mode rebinds the backend connection per transaction, so a server-side
 * prepared statement created on one backend will not exist on the next. `prepare: false` is not a
 * tuning knob there - it is required.
 *
 * `max` is forwarded only when supplied: postgres-js has its own default, and inventing one here
 * would silently override it.
 */
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
