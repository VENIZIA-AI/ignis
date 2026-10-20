import { EnvironmentKeys as BaseEnv } from '@venizia/ignis';

export class EnvironmentKeys extends BaseEnv {
  /** A plain Postgres connection string. Local docker: postgres://postgres:postgres@localhost:15433/postgres */
  static readonly APP_ENV_SUPABASE_DATABASE_URL = 'APP_ENV_SUPABASE_DATABASE_URL';

  /** `direct` | `session` | `transaction` - see PoolerModes. Decides whether prepared statements survive. */
  static readonly APP_ENV_SUPABASE_POOLER_MODE = 'APP_ENV_SUPABASE_POOLER_MODE';

  /** Forwarded to postgres-js only when set, so its own default survives when it is not. */
  static readonly APP_ENV_SUPABASE_POOL_MAX = 'APP_ENV_SUPABASE_POOL_MAX';

  // `APP_ENV_JWT_SECRET` and `APP_ENV_JWT_EXPIRES_IN` are inherited from the base class. On a real
  // Supabase project the secret is the project's JWT secret, and Supabase Auth (GoTrue) signs with
  // it. This example mints its own test tokens with the same secret (`src/token.ts`), so it needs no
  // GoTrue of its own.
}
