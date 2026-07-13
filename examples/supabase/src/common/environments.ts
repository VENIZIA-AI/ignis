import { EnvironmentKeys as BaseEnv } from '@venizia/ignis';

export class EnvironmentKeys extends BaseEnv {
  /** Full Postgres URL. Supabase hands you one - it is not assembled from host/port/user parts. */
  static readonly APP_ENV_SUPABASE_DATABASE_URL = 'APP_ENV_SUPABASE_DATABASE_URL';

  /** `direct` | `session` | `transaction` - see PoolerModes. Decides whether prepared statements survive. */
  static readonly APP_ENV_SUPABASE_POOLER_MODE = 'APP_ENV_SUPABASE_POOLER_MODE';

  /** Forwarded to postgres-js only when set, so its own default survives when it is not. */
  static readonly APP_ENV_SUPABASE_POOL_MAX = 'APP_ENV_SUPABASE_POOL_MAX';

  /** Project URL, e.g. https://supabase.example.com - GoTrue lives at `${url}/auth/v1`. */
  static readonly APP_ENV_SUPABASE_URL = 'APP_ENV_SUPABASE_URL';

  /** The anon key, required by Kong on every GoTrue call. Not a secret in the RLS sense. */
  static readonly APP_ENV_SUPABASE_ANON_KEY = 'APP_ENV_SUPABASE_ANON_KEY';
}
