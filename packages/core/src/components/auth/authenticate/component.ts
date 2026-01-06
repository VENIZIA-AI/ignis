import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import {
  AuthenticateBindingKeys,
  IAuthenticateOptions,
  IBasicTokenServiceOptions,
  IJWTTokenServiceOptions,
} from './common';
import { BasicTokenService, JWTTokenService } from './services';
import { getError, ValueOrPromise } from '@venizia/ignis-helpers';
import { defineAuthController } from './controllers';
import { Binding } from '@/helpers/inversion';

const DEFAULT_SECRET = 'unknown_secret';

const DEFAULT_OPTIONS: IAuthenticateOptions = {
  restOptions: {
    useAuthController: false,
  },
};

export class AuthenticateComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: AuthenticateComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [AuthenticateBindingKeys.AUTHENTICATE_OPTIONS]: Binding.bind<IAuthenticateOptions>({
          key: AuthenticateBindingKeys.AUTHENTICATE_OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
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
      this.logger.debug('[defineJWTAuth] jwtOptions not provided, skipping JWT configuration');
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

    this.logger.info('[defineJWTAuth] JWT authentication configured');
  }

  // ---------------------------------------------------------------------------
  /**
   * Configure Basic authentication if basicOptions is provided.
   */
  private defineBasicAuth(opts: IAuthenticateOptions): void {
    const { basicOptions } = opts;

    if (!basicOptions) {
      this.logger.debug('[defineBasicAuth] basicOptions not provided, skipping Basic configuration');
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

    this.logger.info('[defineBasicAuth] Basic authentication configured');
  }

  // ---------------------------------------------------------------------------
  /**
   * Configure auth controllers if enabled.
   */
  private defineControllers(opts: IAuthenticateOptions): void {
    const { restOptions } = opts;

    if (!restOptions?.useAuthController) {
      this.logger.debug('[defineControllers] Auth controller disabled');
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

    this.logger.info('[defineControllers] Auth controller registered');
  }

  // ---------------------------------------------------------------------------
  defineOAuth2() {
    // TODO Implement OAuth2
  }

  // ---------------------------------------------------------------------------
  override binding(): ValueOrPromise<void> {
    const authenticateOptions = this.application.get<IAuthenticateOptions>({
      key: AuthenticateBindingKeys.AUTHENTICATE_OPTIONS,
    });

    // Validate at least one auth option is provided
    this.validateOptions(authenticateOptions);

    // Configure each auth method
    this.defineJWTAuth(authenticateOptions);
    this.defineBasicAuth(authenticateOptions);
    this.defineControllers(authenticateOptions);

    this.defineOAuth2();
  }
}
