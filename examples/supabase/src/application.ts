// The application class. `src/index.ts` starts it; the smoke test boots the same class.
import { EnvironmentKeys } from '@/common/environments';
import {
  ApiReferenceComponent,
  AuthenticateBindingKeys,
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  BaseApplication,
  HealthCheckComponent,
  type IApplicationInfo,
  JOSEStandards,
  JWSAuthenticationStrategy,
} from '@venizia/ignis';
import { AppEnvs, ParseUtility } from '@venizia/ignis-helpers';
import { getJwtClaims } from '@/common/jwt-claims';
import appInfo from '../package.json';

export class Application extends BaseApplication {
  override getAppInfo(): IApplicationInfo {
    return appInfo;
  }

  override staticConfigure(): void {}

  override preConfigure(): void {
    this.component(ApiReferenceComponent);
    this.component(HealthCheckComponent);

    /**
     * Supabase Auth (GoTrue) issues HS256 tokens signed with the project's JWT secret - exactly what
     * JWSTokenService verifies. This app never signs a token for a real deployment; it only verifies
     * one minted elsewhere with the same secret. `getTokenExpiresFn` is only consulted when signing,
     * which `src/token.ts` does for this example's own test tokens.
     */
    this.bind({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
      standard: JOSEStandards.JWS,
      options: {
        jwtSecret: AppEnvs.getRequired(EnvironmentKeys.APP_ENV_JWT_SECRET),
        claims: getJwtClaims(),
        getTokenExpiresFn: () =>
          ParseUtility.toInt({
            input: AppEnvs.get(EnvironmentKeys.APP_ENV_JWT_EXPIRES_IN),
          }),
      },
    });

    this.component(AuthenticateComponent);

    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [{ name: Authentication.STRATEGY_JWT, strategy: JWSAuthenticationStrategy }],
    });
  }

  override postConfigure(): void {}

  override setupMiddlewares(): void {}
}
