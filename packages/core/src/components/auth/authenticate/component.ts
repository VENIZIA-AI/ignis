import { BaseApplication } from '@/base/applications/base';
import { BaseComponent } from '@/base/components/base';
import { inject } from '@/base/metadata/injectors';
import { CoreBindings } from '@/common/bindings';
import { Binding } from '@venizia/ignis-inversion';
import { getError, ValueOrPromise } from '@venizia/ignis-helpers';
import {
  AuthenticateBindingKeys,
  IAuthenticateOptions,
  IBasicTokenServiceOptions,
  IJWTTokenServiceOptions,
  TAuthenticationRestOptions,
} from './common';
import { BasicTokenService, JWTTokenService } from './services';
import { defineAuthController } from './controllers';

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

  // ---------------------------------------------------------------------------
  override binding(): ValueOrPromise<void> {
    const options: IAuthenticateOptions = {
      restOptions: this.application.get<TAuthenticationRestOptions>({
        key: AuthenticateBindingKeys.REST_OPTIONS,
        isOptional: true,
      }),
      jwtOptions: this.application.get<IJWTTokenServiceOptions>({
        key: AuthenticateBindingKeys.JWT_OPTIONS,
        isOptional: true,
      }),
      basicOptions: this.application.get<IBasicTokenServiceOptions>({
        key: AuthenticateBindingKeys.BASIC_OPTIONS,
        isOptional: true,
      }),
    };

    if (!options.jwtOptions && !options.basicOptions) {
      throw getError({
        message:
          '[AuthenticateComponent] At least one of jwtOptions or basicOptions must be provided',
      });
    }

    // Configure each auth method
    this.defineJWTAuth({ options });
    this.defineBasicAuth({ options });
    this.defineControllers({ options });

    this.defineOAuth2();
  }

  // ---------------------------------------------------------------------------
  private defineJWTAuth(opts: { options: IAuthenticateOptions }): void {
    const { jwtOptions } = opts.options;

    if (!jwtOptions) {
      this.logger
        .for(this.defineJWTAuth.name)
        .debug('jwtOptions not provided, skipping JWT configuration');
      return;
    }

    const { jwtSecret, applicationSecret, getTokenExpiresFn } = jwtOptions;

    // Validate JWT secrets
    if (!jwtSecret || jwtSecret === DEFAULT_SECRET) {
      throw getError({
        message: `[defineJWTAuth] Invalid jwtSecret | Provided: ${jwtSecret}`,
      });
    }

    if (!applicationSecret || applicationSecret === DEFAULT_SECRET) {
      throw getError({
        message: `[defineJWTAuth] Invalid applicationSecret | Provided: ${applicationSecret}`,
      });
    }

    if (!getTokenExpiresFn) {
      throw getError({
        message: '[defineJWTAuth] getTokenExpiresFn is required',
      });
    }

    // Bind JWT options and register service
    this.application
      .bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS })
      .toValue(jwtOptions);
    this.application.service(JWTTokenService);

    this.logger.for(this.defineJWTAuth.name).info('JWT authentication configured');
  }

  // ---------------------------------------------------------------------------
  private defineBasicAuth(opts: { options: IAuthenticateOptions }): void {
    const { basicOptions } = opts.options;

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

    // Bind Basic options and register service
    this.application
      .bind<IBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS })
      .toValue(basicOptions);
    this.application.service(BasicTokenService);

    this.logger.for(this.defineBasicAuth.name).info('Basic authentication configured');
  }

  // ---------------------------------------------------------------------------
  private defineControllers(opts: { options: IAuthenticateOptions }): void {
    const { restOptions, jwtOptions } = opts.options;

    if (!restOptions?.useAuthController) {
      this.logger.for(this.defineControllers.name).debug('Auth controller disabled');
      return;
    }

    // Auth controller requires JWT for token generation
    if (!jwtOptions) {
      throw getError({
        message: '[defineControllers] Auth controller requires jwtOptions to be configured',
      });
    }

    const AuthController = defineAuthController(restOptions.controllerOpts);
    this.application.controller(AuthController);

    this.logger.for(this.defineControllers.name).info('Auth controller registered');
  }

  // ---------------------------------------------------------------------------
  defineOAuth2() {
    // TODO Implement OAuth2
  }
}
