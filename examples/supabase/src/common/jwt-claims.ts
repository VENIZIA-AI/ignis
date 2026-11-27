import { EnvironmentKeys } from '@/common/environments';
import type { IJWTClaimsOptions } from '@venizia/ignis';
import { AppEnvs } from '@venizia/ignis-helpers';

/**
 * The `iss` and `aud` this app requires of a token and stamps on the test tokens it mints. Supabase Auth
 * (GoTrue) writes `https://<project>.supabase.co/auth/v1` and `authenticated`. The issuer has no default;
 * `.env.example` carries the local Supabase CLI's.
 */
export const getJwtClaims = (): IJWTClaimsOptions => ({
  issuer: AppEnvs.getRequired(EnvironmentKeys.APP_ENV_JWT_ISSUER),
  audience: AppEnvs.get(EnvironmentKeys.APP_ENV_JWT_AUDIENCE, {
    defaultValue: 'authenticated',
  }),
});
