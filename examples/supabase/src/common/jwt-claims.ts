import { EnvironmentKeys } from '@/common/environments';
import type { IJWTClaimsOptions } from '@venizia/ignis';
import { applicationEnvironment } from '@venizia/ignis-helpers';

/**
 * The `iss` and `aud` this app requires of a token and stamps on the test tokens it mints. Supabase Auth
 * (GoTrue) writes `https://<project>.supabase.co/auth/v1` and `authenticated`; the defaults are those of the
 * local Supabase CLI.
 */
export const getJwtClaims = (): IJWTClaimsOptions => ({
  issuer: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWT_ISSUER, {
    defaultValue: 'http://127.0.0.1:54321/auth/v1',
  }),
  audience: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWT_AUDIENCE, {
    defaultValue: 'authenticated',
  }),
});
