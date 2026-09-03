import type { BaseApplication } from '@/base/applications/base';
import { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { Binding } from '@venizia/ignis-inversion';
import {
  AuthenticateBindingKeys,
  Authentication,
  AuthenticationStrategyRegistry,
  BaseComponent,
  controller,
  CoreBindings,
  IAuthenticateOptions,
  IJWKSIssuerOptions,
  IJWKSVerifierOptions,
  IJWSTokenServiceOptions,
  inject,
  IServiceAuthOptions,
  JOSEStandards,
  JWKSKeyFormats,
  JWKSModes,
  ServiceAssertion,
  TAuthenticationRestOptions,
  TBasicTokenServiceOptions,
  TJWKSTokenServiceOptions,
  TJWTTokenServiceOptions,
} from '@venizia/ignis-kernel';
import { defineAuthController, JWKSController } from './controllers';
import { ServiceCertsController } from './controllers/service-certs';
import {
  BasicTokenService,
  JWKSIssuerTokenService,
  JWKSVerifierTokenService,
  JWSTokenService,
} from './services';
import { ServiceAssertionSignerService } from './services/service/signer.service';
import { ServiceAssertionVerifierService } from './services/service/verifier.service';
import { ServiceAuthenticationStrategy } from './strategies/service.strategy';

const DEFAULT_SECRET = 'unknown_secret';

export class AuthenticateComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: AuthenticateComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [AuthenticateBindingKeys.REST_OPTIONS]: Binding.bind<TAuthenticationRestOptions>({
          key: AuthenticateBindingKeys.REST_OPTIONS,
        }).toValue({ useAuthController: false }),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    const jwtOptions = this.application.get<TJWTTokenServiceOptions>({
      key: AuthenticateBindingKeys.JWT_OPTIONS,
      isOptional: true,
    });
    const basicOptions = this.application.get<TBasicTokenServiceOptions>({
      key: AuthenticateBindingKeys.BASIC_OPTIONS,
      isOptional: true,
    });
    const restOptions = this.application.get<TAuthenticationRestOptions>({
      key: AuthenticateBindingKeys.REST_OPTIONS,
      isOptional: true,
    });
    const serviceOptions = this.application.get<IServiceAuthOptions>({
      key: AuthenticateBindingKeys.SERVICE_OPTIONS,
      isOptional: true,
    });

    // A service that only VERIFIES assertions needs neither jwt nor basic - and that application,
    // an IGNIS app consuming no user tokens at all, is exactly what the service strategy is for.
    if (!jwtOptions && !basicOptions && !serviceOptions) {
      throw getError({
        message:
          '[AuthenticateComponent] At least one of jwtOptions, basicOptions or serviceOptions must be provided',
      });
    }

    const options: IAuthenticateOptions = { restOptions, jwtOptions, basicOptions, serviceOptions };

    if (jwtOptions) {
      switch (jwtOptions.standard) {
        case JOSEStandards.JWS: {
          this.defineJWSAuth({ options: jwtOptions.options });
          break;
        }
        case JOSEStandards.JWKS: {
          this.defineJWKSAuth({ options: jwtOptions.options });
          break;
        }
        default: {
          throw getError({
            message: `[AuthenticateComponent] Unknown JOSE standard: ${(jwtOptions as any).standard}`,
          });
        }
      }
    }

    this.defineBasicAuth({ basicOptions });
    this.defineServiceAuth({ serviceOptions });

    this.defineControllers({ options });

    this.defineOAuth2();
  }

  private defineJWSAuth(opts: { options: IJWSTokenServiceOptions }): void {
    const { options: jwsOptions } = opts;

    const { jwtSecret, getTokenExpiresFn } = jwsOptions;

    if (!jwtSecret || jwtSecret === DEFAULT_SECRET) {
      throw getError({
        message: `[defineJWSAuth] Invalid jwtSecret | Provided: ${jwtSecret}`,
      });
    }

    if (!getTokenExpiresFn) {
      throw getError({
        message: '[defineJWSAuth] getTokenExpiresFn is required',
      });
    }

    this.application
      .bind<IJWSTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS })
      .toValue(jwsOptions);
    this.application.service(JWSTokenService);

    this.logger.for(this.defineJWSAuth.name).info('JWS authentication configured');
  }

  private defineJWKSAuth(opts: { options: TJWKSTokenServiceOptions }): void {
    const { options: jwksOptions } = opts;

    switch (jwksOptions.mode) {
      case JWKSModes.ISSUER: {
        const issuerOpts = jwksOptions;

        if (!issuerOpts.keys?.private || !issuerOpts.keys?.public) {
          throw getError({
            message: '[defineJWKSAuth] keys.private and keys.public are required for issuer mode',
          });
        }

        if (!issuerOpts.keys?.format || !JWKSKeyFormats.isValid(issuerOpts.keys.format)) {
          throw getError({
            message: `[defineJWKSAuth] keys.format is required and must be one of: ${[...JWKSKeyFormats.SCHEME_SET].join(', ')}`,
          });
        }

        if (!issuerOpts.kid) {
          throw getError({ message: '[defineJWKSAuth] kid is required for issuer mode' });
        }

        if (!issuerOpts.getTokenExpiresFn) {
          throw getError({
            message: '[defineJWKSAuth] getTokenExpiresFn is required for issuer mode',
          });
        }

        this.application
          .bind<IJWKSIssuerOptions>({ key: AuthenticateBindingKeys.JWKS_OPTIONS })
          .toValue(issuerOpts);
        this.application.service(JWKSIssuerTokenService);

        // Path depends on a runtime option, so @controller can't be applied statically — decorate here instead.
        Reflect.decorate(
          [controller({ path: issuerOpts?.rest?.path ?? '/certs' })],
          JWKSController,
        );
        this.application.controller(JWKSController);

        this.logger
          .for(this.defineJWKSAuth.name)
          .info('JWKS issuer configured with /certs endpoint');
        break;
      }

      case JWKSModes.VERIFIER: {
        const verifierOpts = jwksOptions;

        if (!verifierOpts.jwksUrl) {
          throw getError({ message: '[defineJWKSAuth] jwksUrl is required for verifier mode' });
        }

        this.application
          .bind<IJWKSVerifierOptions>({ key: AuthenticateBindingKeys.JWKS_OPTIONS })
          .toValue(verifierOpts);
        this.application.service(JWKSVerifierTokenService);

        this.logger.for(this.defineJWKSAuth.name).info('JWKS verifier configured');
        break;
      }

      default: {
        // Same exhaustive-switch-narrows-to-never situation as the JOSE standard default above.
        throw getError({
          message: `[defineJWKSAuth] Invalid JWKS mode: ${(jwksOptions as { mode?: unknown }).mode}`,
        });
      }
    }
  }

  /**
   * Service-to-service authentication. Absent options mean no strategy is registered and no route is
   * mounted, so an application that never sets them is byte-identical to today.
   *
   * The certs route is mounted only when SIGNING keys are present. Most services are called and
   * never call; publishing a key set for a service that signs nothing advertises a capability it
   * does not have.
   */
  private defineServiceAuth(opts: { serviceOptions?: IServiceAuthOptions }): void {
    const { serviceOptions } = opts;

    if (!serviceOptions) {
      this.logger
        .for(this.defineServiceAuth.name)
        .debug('serviceOptions not provided, skipping service authentication');
      return;
    }

    if (!serviceOptions.name) {
      throw getError({
        message:
          '[defineServiceAuth] name is required | it is the issuer this service stamps and the audience it demands',
      });
    }

    if (!serviceOptions.resolvePrincipal) {
      throw getError({
        message:
          '[defineServiceAuth] resolvePrincipal is required | the framework proves WHICH SERVICE called, the application decides who that acts as',
      });
    }

    this.application.service(ServiceAssertionVerifierService);

    if (serviceOptions.keys) {
      this.application.service(ServiceAssertionSignerService);

      const restPath = serviceOptions.rest?.path ?? ServiceAssertion.DEFAULT_REST_PATH;
      this.application
        .bind<string>({ key: AuthenticateBindingKeys.SERVICE_CERTS_PATH })
        .toValue(restPath);

      // Path depends on a runtime option, so @controller cannot be applied statically.
      Reflect.decorate([controller({ path: restPath })], ServiceCertsController);
      this.application.controller(ServiceCertsController);
    }

    AuthenticationStrategyRegistry.getInstance().register({
      container: this.application,
      strategies: [
        { name: Authentication.STRATEGY_SERVICE, strategy: ServiceAuthenticationStrategy },
      ],
    });

    this.logger
      .for(this.defineServiceAuth.name)
      .info(
        'Service authentication configured | name: %s | signs: %s | callers: %s',
        serviceOptions.name,
        Boolean(serviceOptions.keys),
        Object.keys(serviceOptions.callers ?? {}).join(', ') || 'none',
      );
  }

  private defineBasicAuth(opts: { basicOptions?: TBasicTokenServiceOptions }): void {
    const { basicOptions } = opts;

    if (!basicOptions) {
      this.logger
        .for(this.defineBasicAuth.name)
        .debug('basicOptions not provided, skipping Basic configuration');
      return;
    }

    if (!basicOptions.verifyCredentials) {
      throw getError({
        message: '[defineBasicAuth] verifyCredentials function is required',
      });
    }

    this.application
      .bind<TBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS })
      .toValue(basicOptions);
    this.application.service(BasicTokenService);

    this.logger.for(this.defineBasicAuth.name).info('Basic authentication configured');
  }

  private defineControllers(opts: { options: IAuthenticateOptions }): void {
    const { restOptions, jwtOptions } = opts.options;

    if (!restOptions?.useAuthController) {
      this.logger.for(this.defineControllers.name).debug('Auth controller disabled');
      return;
    }

    if (!jwtOptions) {
      throw getError({
        message: '[defineControllers] Auth controller requires jwtOptions to be configured',
      });
    }

    const AuthController = defineAuthController(restOptions.controllerOpts);
    this.application.controller(AuthController);

    this.logger.for(this.defineControllers.name).info('Auth controller registered');
  }

  defineOAuth2() {
    // TODO Implement OAuth2
  }
}
