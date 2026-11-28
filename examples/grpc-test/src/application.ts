import { EnvKeys } from '@/common/env-keys';
import { GrpcNativeSettings } from '@/common/grpc-native-settings';
import { RpcLogInterceptor } from '@/interceptors/rpc-log.interceptor';
import { RolePolicyEnforcer } from '@/security/role-policy.enforcer';
import { NoteService } from '@/services/note.service';
import { SeedService } from '@/services/seed.service';
import { WebDemo } from '@/web/web-demo';
import {
  AuthenticateBindingKeys,
  AuthenticateComponent,
  Authentication,
  AuthenticationStrategyRegistry,
  AuthorizationDecisions,
  AuthorizationEnforcerRegistry,
  AuthorizationEnforcerTypes,
  AuthorizeBindingKeys,
  AuthorizeComponent,
  BaseApplication,
  BindingKeys,
  BindingNamespaces,
  HealthCheckComponent,
  JOSEStandards,
  JWSAuthenticationStrategy,
  type IApplicationInfo,
} from '@venizia/ignis';
import { GrpcBindingKeys } from '@venizia/ignis/grpc';
import { AppEnvs, Execution, ExecutionModes, ParseUtility } from '@venizia/ignis-helpers';
import appInfo from '../package.json';

const ONE_HOUR_IN_SECONDS = 3_600;
/** The largest message a client may send, decoded. The framework's default is 5 MiB. */
const MAX_MESSAGE_BYTES = 64 * 1024;

/** The application: authentication, authorization and both gRPC ports. The end-to-end test boots the same class. */
export class Application extends BaseApplication {
  override getAppInfo(): IApplicationInfo {
    return appInfo;
  }

  override staticConfigure(): void {}

  override preConfigure(): void {
    this.configureAuthentication();
    this.configureAuthorization();

    // Both ports run the same controllers: Connect and gRPC-Web on the application port, native gRPC on its own.
    this.bind({ key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS }).toValue({
      interceptors: [RpcLogInterceptor.create()],
      limits: { messageSize: MAX_MESSAGE_BYTES },
      native: GrpcNativeSettings.read(),
    });

    this.component(HealthCheckComponent);

    // Registered here, so it runs before the hook that stops the native port: followed streams end at once on both
    // ports, instead of holding the shutdown until its timeout.
    this.registerPostStopHook({
      identifier: 'notes.watchers.close',
      hook: () => {
        const key = BindingKeys.build<NoteService>({
          namespace: BindingNamespaces.SERVICE,
          key: NoteService.name,
        });
        this.get({ key }).close();
      },
    });
  }

  override async postConfigure(): Promise<void> {
    const seedService = this.get({
      key: BindingKeys.build<SeedService>({
        namespace: BindingNamespaces.SERVICE,
        key: SeedService.name,
      }),
    });

    // Nobody is signed in at boot: a system frame lifts the row scope, and the log names the reason.
    await Execution.run({
      mode: ExecutionModes.SYSTEM,
      reason: 'seed the demo users and their note',
      task: () => seedService.seed(),
    });
  }

  override setupMiddlewares(): void {
    WebDemo.mount({ server: this.getServer() });
  }

  private configureAuthentication() {
    // HMAC-signed tokens (JWS). The component refuses to start with a secret under 32 bytes.
    this.bind({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
      standard: JOSEStandards.JWS,
      options: {
        jwtSecret: AppEnvs.getRequired(EnvKeys.APP_ENV_JWT_SECRET),
        claims: { issuer: appInfo.name, audience: appInfo.name },
        getTokenExpiresFn: () =>
          ParseUtility.toNumber({ input: AppEnvs.get(EnvKeys.APP_ENV_JWT_EXPIRES_IN) }) ??
          ONE_HOUR_IN_SECONDS,
      },
    });
    this.component(AuthenticateComponent);

    // What `authenticate: { strategies: [Authentication.STRATEGY_JWT] }` on an RPC resolves to.
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [{ name: Authentication.STRATEGY_JWT, strategy: JWSAuthenticationStrategy }],
    });
  }

  private configureAuthorization() {
    // Default deny: what the policy does not allow is refused.
    this.bind({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
      defaultDecision: AuthorizationDecisions.DENY,
    });
    this.component(AuthorizeComponent);

    AuthorizationEnforcerRegistry.getInstance().register({
      container: this,
      enforcers: [
        {
          enforcer: RolePolicyEnforcer,
          name: RolePolicyEnforcer.name,
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });
  }
}
