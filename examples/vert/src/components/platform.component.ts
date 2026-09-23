import { EnvironmentKeys } from '@/common';
import {
  ChangePasswordRequestSchema,
  ChangePasswordResponseSchema,
  Organization,
  SignInRequestSchema,
  SignInResponseSchema,
  SignUpRequestSchema,
  SignUpResponseSchema,
} from '@/models';
import { AuthenticationService } from '@/services';
import {
  AuthenticateBindingKeys,
  Authentication,
  AuthorizeBindingKeys,
  BaseApplication,
  BaseComponent,
  BindingKeys,
  BindingNamespaces,
  component,
  CoreBindings,
  HealthCheckBindingKeys,
  inject,
  JOSEStandards,
  JWKSModes,
  provide,
} from '@venizia/ignis';
import {
  BaseMetaLinkModel,
  StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes,
} from '@venizia/ignis/static-asset';
// Type-only: a decorated method's return type lands in `design:returntype`, and bun keeps a value
// import it cannot prove is a type - which then fails to link against the CJS dist.
import type {
  IAuthorizeOptions,
  IHealthCheckOptions,
  TAuthenticationRestOptions,
  TBasicTokenServiceOptions,
  TJWKSAlgorithm,
  TJWKSKeyDriver,
  TJWKSKeyFormat,
  TJWTTokenServiceOptions,
} from '@venizia/ignis';
import type { TStaticAssetsComponentOptions } from '@venizia/ignis/static-asset';
import { applicationEnvironment, DiskHelper, getError, int } from '@venizia/ignis-helpers';
import { MetaLinkRepository } from '@/repositories/meta-link.repository';

/**
 * Options the framework components read while they configure. Each `@provide` binds a lazy
 * provider, so this component needs no particular position in the boot order.
 */
@component()
export class PlatformComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({ scope: PlatformComponent.name });
  }

  // Nothing eager: every option below is a provider resolved on first read.
  override binding(): void {}

  /**
   * Two asset stores on one component. `staticAsset` turns on `useMetaLink`, so every upload also
   * writes a row through the application's own repository - the repository resolves here rather than
   * in the constructor because a provider runs on first read, after every repository is bound.
   */
  @provide({ key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS })
  staticAssetOptions(): TStaticAssetsComponentOptions {
    return {
      staticAsset: {
        controller: { name: 'AssetController', basePath: '/assets', isStrict: true },
        storage: StaticAssetStorageTypes.DISK,
        helper: new DiskHelper({ basePath: './app_data/assets' }),
        useMetaLink: true,
        metaLink: {
          model: BaseMetaLinkModel,
          repository: this.application.get<MetaLinkRepository>({
            key: { namespace: BindingNamespaces.REPOSITORY, key: MetaLinkRepository.name },
          }),
        },
        extra: { parseMultipartBody: { storage: 'memory' } },
      },
      staticResource: {
        controller: { name: 'ResourceController', basePath: '/resources', isStrict: true },
        storage: StaticAssetStorageTypes.DISK,
        helper: new DiskHelper({ basePath: './app_data/resources' }),
        extra: { parseMultipartBody: { storage: 'memory' } },
      },
    };
  }

  @provide({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
  healthCheckOptions(): IHealthCheckOptions {
    return { restOptions: { path: '/health-check' } };
  }

  @provide({ key: AuthenticateBindingKeys.REST_OPTIONS })
  authenticationRestOptions(): TAuthenticationRestOptions {
    return {
      useAuthController: true,
      controllerOpts: {
        restPath: '/auth',
        serviceKey: BindingKeys.build({
          namespace: BindingNamespaces.SERVICE,
          key: AuthenticationService.name,
        }),
        payload: {
          signIn: {
            request: { schema: SignInRequestSchema },
            response: { schema: SignInResponseSchema },
          },
          signUp: {
            request: { schema: SignUpRequestSchema },
            response: { schema: SignUpResponseSchema },
          },
          changePassword: {
            request: { schema: ChangePasswordRequestSchema },
            response: { schema: ChangePasswordResponseSchema },
          },
        },
      },
    };
  }

  @provide({ key: AuthenticateBindingKeys.JWT_OPTIONS })
  jwtOptions(): TJWTTokenServiceOptions {
    return {
      standard: JOSEStandards.JWKS,
      options: {
        mode: JWKSModes.ISSUER,
        algorithm: applicationEnvironment.get<TJWKSAlgorithm>(
          EnvironmentKeys.APP_ENV_JWKS_ALGORITHM,
        ),
        keys: {
          driver: applicationEnvironment.get<TJWKSKeyDriver>(
            EnvironmentKeys.APP_ENV_JWKS_KEY_DRIVER,
          ),
          format: applicationEnvironment.get<TJWKSKeyFormat>(
            EnvironmentKeys.APP_ENV_JWKS_KEY_FORMAT,
          ),
          private: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWKS_PRIVATE_KEY),
          public: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWKS_PUBLIC_KEY),
        },
        kid: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_JWKS_KID),
        getTokenExpiresFn: () => {
          const expiresIn = applicationEnvironment.get<string>(
            EnvironmentKeys.APP_ENV_JWT_EXPIRES_IN,
          );
          if (!expiresIn) {
            throw getError({ message: '[getTokenExpiresFn] APP_ENV_JWT_EXPIRES_IN is not set' });
          }
          return int(expiresIn);
        },
      },
    };
  }

  @provide({ key: AuthenticateBindingKeys.BASIC_OPTIONS })
  basicOptions(): TBasicTokenServiceOptions {
    return {
      verifyCredentials: async opts => {
        const authenticationService = this.application.get<AuthenticationService>({
          key: { namespace: BindingNamespaces.SERVICE, key: AuthenticationService.name },
        });
        return authenticationService.signIn(opts.context, {
          identifier: { scheme: 'username', value: opts.credentials.username },
          credential: { scheme: 'basic', value: opts.credentials.password },
        });
      },
    };
  }

  @provide({ key: AuthorizeBindingKeys.OPTIONS })
  authorizeOptions(): IAuthorizeOptions {
    return {
      defaultDecision: 'deny',
      alwaysAllowRoles: ['999_super-admin'],
      // Scoped RBAC: the request domain is the authenticated user's organization.
      domainResolver: ({ context }) => {
        const organizationId = context.get(Authentication.CURRENT_USER)?.organizationId;
        return typeof organizationId === 'string'
          ? { type: Organization.name, id: organizationId }
          : null;
      },
    };
  }
}
