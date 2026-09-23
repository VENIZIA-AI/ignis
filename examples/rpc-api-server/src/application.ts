// The application class. `src/index.ts` starts it; the smoke test boots the same class.
import {
  ApiReferenceComponent,
  AuthenticateBindingKeys,
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  BaseApplication,
  BindingKeys,
  BindingNamespaces,
  ChangePasswordRequestSchema,
  HealthCheckComponent,
  IApplicationInfo,
  JOSEStandards,
  JWSAuthenticationStrategy,
  SignInRequestSchema,
  SignUpRequestSchema,
  TAuthenticationRestOptions,
  TJWTTokenServiceOptions,
} from '@venizia/ignis';
import { blankToUndefined } from '@venizia/ignis-helpers';
import appInfo from '../package.json';
import {
  ChangePasswordResponseSchema,
  SignInResponseSchema,
  SignUpResponseSchema,
} from './models/auth.schema';
import { AuthenticationService } from './services/authentication.service';

// Importing a decorated class is what registers it: `discoverArtifacts: true` binds every one.
import './datasources/pglite.datasource';
import './repositories/user.repository';
import './repositories/configuration.repository';
import './controllers/configuration.controller';
import './controllers/view.controller';

const ONE_DAY_IN_SECONDS = 86_400;

export class Application extends BaseApplication {
  override getAppInfo(): IApplicationInfo {
    return appInfo;
  }

  override staticConfigure(): void {}

  override preConfigure(): void {
    // Tokens are HMAC-signed (JWS). The component refuses to start without a secret.
    this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
      standard: JOSEStandards.JWS,
      options: {
        jwtSecret: process.env.APP_ENV_JWT_SECRET ?? '',
        getTokenExpiresFn: () =>
          Number(blankToUndefined(process.env.APP_ENV_JWT_EXPIRES_IN) ?? ONE_DAY_IN_SECONDS),
      },
    });

    // Mounts /auth/sign-up, /auth/sign-in, ... and hands each request to AuthenticationService.
    this.bind<TAuthenticationRestOptions>({ key: AuthenticateBindingKeys.REST_OPTIONS }).toValue({
      useAuthController: true,
      controllerOpts: {
        serviceKey: BindingKeys.build({
          namespace: BindingNamespaces.SERVICE,
          key: AuthenticationService.name,
        }),
        payload: {
          signUp: {
            request: { schema: SignUpRequestSchema },
            response: { schema: SignUpResponseSchema },
          },
          signIn: {
            request: { schema: SignInRequestSchema },
            response: { schema: SignInResponseSchema },
          },
          changePassword: {
            request: { schema: ChangePasswordRequestSchema },
            response: { schema: ChangePasswordResponseSchema },
          },
        },
      },
    });

    this.component(AuthenticateComponent);

    // What `authenticate: { strategies: [Authentication.STRATEGY_JWT] }` on a route resolves to.
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [{ name: Authentication.STRATEGY_JWT, strategy: JWSAuthenticationStrategy }],
    });

    this.component(ApiReferenceComponent);
    this.component(HealthCheckComponent);
  }

  override postConfigure(): void {}

  override setupMiddlewares(): void {}
}
