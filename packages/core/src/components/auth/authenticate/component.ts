import type { BaseApplication } from '@/base/applications/base';
import { BaseComponent } from '@/base/components/base';
import { inject } from '@/base/metadata/injectors';
import { controller } from '@/base/metadata/routes';
import { CoreBindings } from '@/common/bindings';
import { getError, ValueOrPromise } from '@venizia/ignis-helpers';
import { Binding } from '@venizia/ignis-inversion';
import {
  AuthenticateBindingKeys,
  IAuthenticateOptions,
  IJWKSIssuerOptions,
  IJWKSVerifierOptions,
  IJWSTokenServiceOptions,
  JOSEStandards,
  JWKSKeyFormats,
  JWKSModes,
  TAuthenticationRestOptions,
  TBasicTokenServiceOptions,
  TJWKSTokenServiceOptions,
  TJWTTokenServiceOptions,
} from './common';
import { defineAuthController, JWKSController } from './controllers';
import {
  BasicTokenService,
  JWKSIssuerTokenService,
  JWKSVerifierTokenService,
  JWSTokenService,
} from './services';

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

    if (!jwtOptions && !basicOptions) {
      throw getError({
        message:
          '[AuthenticateComponent] At least one of jwtOptions or basicOptions must be provided',
      });
    }

    const options: IAuthenticateOptions = { restOptions, jwtOptions, basicOptions };

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
