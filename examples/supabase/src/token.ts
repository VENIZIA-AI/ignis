import { EnvironmentKeys } from '@/common/environments';
import { JWSTokenService } from '@venizia/ignis';
import type { IJWTTokenPayload } from '@venizia/ignis';
import { applicationEnvironment, int } from '@venizia/ignis-helpers';

/**
 * Mints a token with IGNIS's own `JWSTokenService` - the exact class `JWSAuthenticationStrategy`
 * already constructs to verify these tokens - standing in for one Supabase Auth (GoTrue) would issue.
 * This app is the resource server and never issues tokens for a real deployment; this exists only so
 * the README and the smoke test can demonstrate RLS without running GoTrue.
 *
 * `IJWTTokenPayload` is IGNIS's own claim shape (`userId` + `roles`), not the `sub` + `role` shape
 * this example mints - `userId`/`roles: []` below are filler nothing reads. `auth.uid()` reads only
 * the registered `sub` claim (set via `claims.subject`); `withAuthContext` reads `role` off the
 * decoded payload directly, which the index signature on `IJWTTokenPayload` allows through untouched.
 */
export const mintToken = async (opts: { subject: string; role?: string }): Promise<string> => {
  const { subject, role = 'authenticated' } = opts;

  const jwtSecret = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWT_SECRET);
  const expiresIn = int(
    applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWT_EXPIRES_IN, {
      defaultValue: '3600',
    }),
  );

  const service = new JWSTokenService({ jwtSecret, getTokenExpiresFn: () => expiresIn });

  const payload: IJWTTokenPayload = { userId: subject, roles: [], role };

  return service.generate({ payload, claims: { subject } });
};
