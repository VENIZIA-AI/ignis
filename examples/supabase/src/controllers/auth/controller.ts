import { EnvironmentKeys } from '@/common/environments';
import {
  BaseRestController,
  controller,
  IControllerOptions,
  post,
  TRouteContext,
  ValueOrPromise,
} from '@venizia/ignis';
import { applicationEnvironment, getError, HTTP } from '@venizia/ignis-helpers';
import { RouteConfigs, TSignInRequest } from './definitions';

/** GoTrue's wire shape is snake_case. It is read at this boundary and never travels further. */
interface IGoTrueTokenResponse {
  ['access_token']: string;
  ['refresh_token']: string;
  ['expires_in']: number;
  user: { id: string };
}

/**
 * Sign-in is a thin proxy onto the project's own GoTrue. The token this returns is issued by
 * Supabase, signed with the project's JWT secret - the same secret IGNIS's JWSAuthenticationStrategy
 * verifies with. Nothing in this example mints its own token, because a token this app invented
 * would prove nothing about RLS.
 */
@controller({ path: '/auth' })
export class AuthController extends BaseRestController {
  constructor(opts: IControllerOptions) {
    super({ ...opts, scope: AuthController.name });
  }

  override binding(): ValueOrPromise<void> {
    // Routes are declared with decorators; nothing to bind imperatively.
  }

  @post({ configs: RouteConfigs['/sign-in'] })
  async signIn(context: TRouteContext) {
    const { email, password } = (await context.req.json()) as TSignInRequest;

    const supabaseUrl = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_SUPABASE_URL);
    const anonKey = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_SUPABASE_ANON_KEY);

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: HTTP.Methods.POST.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      // The upstream body can carry GoTrue internals; it is logged, never returned.
      const detail = await response.text();
      this.logger
        .for(this.signIn.name)
        .error('GoTrue rejected sign-in | Status: %s | Detail: %s', response.status, detail);

      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Invalid credentials',
      });
    }

    const token = (await response.json()) as IGoTrueTokenResponse;

    return context.json(
      {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresIn: token.expires_in,
        userId: token.user.id,
      },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }
}
