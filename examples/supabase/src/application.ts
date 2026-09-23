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
  type TJWTTokenServiceOptions,
} from '@venizia/ignis';
import { applicationEnvironment, int } from '@venizia/ignis-helpers';
import appInfo from '../package.json';

// Importing a decorated class is what registers it: `discoverArtifacts: true` binds every one.
import './datasources/supabase.datasource';
import './repositories/note.repository';
import './services/note.service';
import './controllers/note.controller';

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
    this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
      standard: JOSEStandards.JWS,
      options: {
        jwtSecret: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWT_SECRET),
        getTokenExpiresFn: () =>
          int(applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWT_EXPIRES_IN)),
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
