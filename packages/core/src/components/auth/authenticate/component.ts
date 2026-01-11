import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import {
  AuthenticateBindingKeys,
  IAuthenticateOptions,
  IBasicTokenServiceOptions,
  IJWTTokenServiceOptions,
  TAuthenticationRestOptions,
} from './common';
import { BasicTokenService, JWTTokenService } from './services';
import { getError, ValueOrPromise } from '@venizia/ignis-helpers';
import { defineAuthController } from './controllers';
import { Binding } from '@/helpers/inversion';

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
        /* [AuthenticateBindingKeys.JWT_OPTIONS]: Binding.bind<IJWTTokenServiceOptions>({
          key: AuthenticateBindingKeys.JWT_OPTIONS,
        }).toValue({}),
        [AuthenticateBindingKeys.BASIC_OPTIONS]: Binding.bind<IBasicTokenServiceOptions>({
          key: AuthenticateBindingKeys.BASIC_OPTIONS,
        }).toValue({}), */
      },
    });
  }

  // ---------------------------------------------------------------------------
  /**
   * Validate that at least one auth option (jwtOptions or basicOptions) is provided.
   * @throws Error if neither option is provided
   */
  private validateOptions(opts: IAuthenticateOptions): void {
    if (!opts.jwtOptions && !opts.basicOptions) {
      throw getError({
        message:
          '[AuthenticateComponent] At least one of jwtOptions or basicOptions must be provided',
      });
    }
  }

  // ---------------------------------------------------------------------------
  /**
   * Configure JWT authentication if jwtOptions is provided.
   */
  private defineJWTAuth(opts: IAuthenticateOptions): void {
    const { jwtOptions } = opts;

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
  /**
   * Configure Basic authentication if basicOptions is provided.
   */
  private defineBasicAuth(opts: IAuthenticateOptions): void {
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

    // Bind Basic options and register service
    this.application
      .bind<IBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS })
      .toValue(basicOptions);
    this.application.service(BasicTokenService);

    this.logger.for(this.defineBasicAuth.name).info('Basic authentication configured');
  }

  // ---------------------------------------------------------------------------
  /**
   * Configure auth controllers if enabled.
   */
  private defineControllers(opts: IAuthenticateOptions): void {
    const { restOptions } = opts;

    if (!restOptions?.useAuthController) {
      this.logger.for(this.defineControllers.name).debug('Auth controller disabled');
      return;
    }

    // Auth controller requires JWT for token generation
    if (!opts.jwtOptions) {
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

  // ---------------------------------------------------------------------------
  override binding(): ValueOrPromise<void> {
    const authenticateOptions: IAuthenticateOptions = {
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

    // Validate at least one auth option is provided
    this.validateOptions(authenticateOptions);

    // Configure each auth method
    this.defineJWTAuth(authenticateOptions);
    this.defineBasicAuth(authenticateOptions);
    this.defineControllers(authenticateOptions);

    this.defineOAuth2();
  }
}
