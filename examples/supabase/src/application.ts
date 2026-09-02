import { EnvironmentKeys } from '@/common/environments';
import {
  ApiReferenceComponent,
  Authentication,
  AuthenticateBindingKeys,
  AuthenticateComponent,
  AuthenticationStrategyRegistry,
  BaseApplication,
  CoreBindings,
  HealthCheckBindingKeys,
  HealthCheckComponent,
  IApplicationConfigs,
  IApplicationInfo,
  IHealthCheckOptions,
  JOSEStandards,
  JWSAuthenticationStrategy,
  TJWTTokenServiceOptions,
  ValueOrPromise,
} from '@venizia/ignis';
import { applicationEnvironment, Environment, int } from '@venizia/ignis-helpers';
import { cors } from 'hono/cors';
import packageJson from './../package.json';
import { AuthController, NoteController } from './controllers';
import { SupabaseDataSource } from './datasources';
import { NoteRepository } from './repositories';
import { NoteService } from './services';

// -----------------------------------------------------------------------------------------------
export const beConfigs: IApplicationConfigs = {
  host: process.env.APP_ENV_SERVER_HOST,
  port: +(process.env.APP_ENV_SERVER_PORT ?? 3000),
  path: {
    base: process.env.APP_ENV_SERVER_BASE_PATH ?? '/api',
    isStrict: true,
  },
  error: { rootKey: 'error' },
  debug: {
    shouldShowRoutes: !Environment.is({ name: Environment.PRODUCTION }),
  },
};

// -----------------------------------------------------------------------------------------------
export class Application extends BaseApplication {
  // --------------------------------------------------------------------------------
  override getProjectRoot(): string {
    const projectRoot = __dirname;
    this.bind<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT }).toValue(projectRoot);
    return projectRoot;
  }

  // --------------------------------------------------------------------------------
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return packageJson;
  }

  // --------------------------------------------------------------------------------
  staticConfigure(): void {
    // Nothing to serve statically.
  }

  // --------------------------------------------------------------------------------
  override setupMiddlewares(): ValueOrPromise<void> {
    this.getServer().use(
      '*',
      cors({
        origin: '*',
        allowMethods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        maxAge: 86_400,
        credentials: true,
      }),
    );
  }

  // --------------------------------------------------------------------------------
  /** Manual registration - the booter cannot discover .ts files when running from source. */
  preConfigure(): ValueOrPromise<void> {
    this.dataSource(SupabaseDataSource);
    this.repository(NoteRepository);
    this.service(NoteService);

    /**
     * Supabase's GoTrue issues HS256 tokens signed with the project's JWT secret. That is exactly
     * what JWSTokenService verifies, so IGNIS needs no Supabase-specific strategy - it needs the
     * secret.
     *
     * `getTokenExpiresFn` is only consulted when SIGNING. This app never signs: it verifies tokens
     * minted by Supabase.
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

    this.controller(AuthController);
    this.controller(NoteController);

    this.bind<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
    }).toValue({
      restOptions: { path: '/health-check' },
    });
    this.component(HealthCheckComponent);

    this.component(ApiReferenceComponent);
  }

  // --------------------------------------------------------------------------------
  postConfigure(): ValueOrPromise<void> {
    // Nothing to do after registration.
  }
}
