import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { EnvironmentKeys } from '@/common';
import { CoreBindings } from '@/common/bindings';
import { ValueOrPromise } from '@/common/types';
import { getError } from '@/helpers';
import { Binding } from '@/helpers/inversion';
import { AuthenticateBindingKeys, IAuthenticateOptions, IJWTTokenServiceOptions } from './common';
import { defineAuthController } from './controllers';
import { JWTTokenService } from './services';

const DEFAULT_OPTIONS: IAuthenticateOptions = {
  restOptions: { path: '/auth' },
  alwaysAllowPaths: [],
  tokenOptions: {
    applicationSecret: process.env[EnvironmentKeys.APP_ENV_APPLICATION_SECRET],
    jwtSecret: process.env[EnvironmentKeys.APP_ENV_JWT_SECRET],
    getTokenExpiresFn: () => {
      const jwtExpiresIn = process.env[EnvironmentKeys.APP_ENV_JWT_EXPIRES_IN];
      if (!jwtExpiresIn) {
        throw getError({
          message: `[getTokenExpiresFn] Invalid APP_ENV_JWT_EXPIRES_IN | jwtExpiresIn: ${jwtExpiresIn}`,
        });
      }

      return parseInt(process.env[EnvironmentKeys.APP_ENV_JWT_EXPIRES_IN]);
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
    this.application
      .bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS })
      .toValue(authenticateOptions.tokenOptions);
    this.application.service(JWTTokenService);

    this.application.controller(
      defineAuthController({
        restPath: authenticateOptions.restOptions?.path ?? '/auth',
      }),
    );
  }

  override binding(): ValueOrPromise<void> {
    this.defineAuth();
    this.defineOAuth2();
  }
}
