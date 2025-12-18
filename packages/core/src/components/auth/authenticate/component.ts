import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { EnvironmentKeys } from '@/common/environments';
import { AuthenticateBindingKeys, IAuthenticateOptions, IJWTTokenServiceOptions } from './common';
import { JWTTokenService } from './services';
import { getError, ValueOrPromise } from '@venizia/ignis-helpers';
import { defineAuthController } from './controllers';
import { Binding } from '@/helpers/inversion';

const DEFAULT_SECRET = 'unknown_secret';

const DEFAULT_OPTIONS: IAuthenticateOptions = {
  restOptions: {
    useAuthController: false,
  },
  alwaysAllowPaths: [],
  tokenOptions: {
    applicationSecret: process.env[EnvironmentKeys.APP_ENV_APPLICATION_SECRET] ?? DEFAULT_SECRET,
    jwtSecret: process.env[EnvironmentKeys.APP_ENV_JWT_SECRET] ?? DEFAULT_SECRET,
    getTokenExpiresFn: () => {
      const jwtExpiresIn = process.env[EnvironmentKeys.APP_ENV_JWT_EXPIRES_IN];
      if (!jwtExpiresIn) {
        throw getError({
          message: `[getTokenExpiresFn] Invalid APP_ENV_JWT_EXPIRES_IN | jwtExpiresIn: ${jwtExpiresIn}`,
        });
      }

      return parseInt(jwtExpiresIn);
    },
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

  defineOAuth2() {
    // TODO Implement OAuth2
  }

  defineAuth() {
    const authenticateOptions = this.application.get<IAuthenticateOptions>({
      key: AuthenticateBindingKeys.AUTHENTICATE_OPTIONS,
    });

    if (!authenticateOptions) {
      throw getError({
        message:
          '[defineAuth] Failed to binding authenticate component | Invalid authenticateOptions',
      });
    }

    if (authenticateOptions.tokenOptions.applicationSecret === DEFAULT_SECRET) {
      throw getError({
        message: `[defineAuth] Failed to binding authenticate component | Invalid tokenOptions.applicationSecret | env: ${EnvironmentKeys.APP_ENV_APPLICATION_SECRET} | secret: ${authenticateOptions.tokenOptions.applicationSecret}`,
      });
    }

    if (authenticateOptions.tokenOptions.jwtSecret === DEFAULT_SECRET) {
      throw getError({
        message: `[defineAuth] Failed to binding authenticate component | Invalid tokenOptions.jwtSecret | env:  | env: ${EnvironmentKeys.APP_ENV_JWT_SECRET} | secret: ${authenticateOptions.tokenOptions.jwtSecret}`,
      });
    }

    this.application
      .bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS })
      .toValue(authenticateOptions.tokenOptions);
    this.application.service(JWTTokenService);

    if (authenticateOptions.restOptions?.useAuthController) {
      this.application.controller(
        defineAuthController(authenticateOptions.restOptions.controllerOpts),
      );
    }
  }

  override binding(): ValueOrPromise<void> {
    this.defineAuth();
    this.defineOAuth2();
  }
}
