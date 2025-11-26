import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { CoreBindings } from '@/common/bindings';
import { ValueOrPromise } from '@/common/types';
import { Binding, BindingScopes } from '@/helpers/inversion';
import { MiddlewareHandler } from 'hono/types';
import { JWTTokenService } from './jwt-token.service';
import { AuthenticateBindingKeys } from './keys';
import { AuthenticateMiddleware } from './middleware';
import { IAuthenticateOptions, IJWTTokenServiceOptions } from './types';
import { EnvironmentKeys } from '@/common';
import { getError } from '@/helpers';

const DEFAULT_OPTIONS: IAuthenticateOptions = {
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
  static readonly AUTH_MW_BINDING_KEY = ['middlewares', AuthenticateMiddleware.name].join('.');

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
        [AuthenticateComponent.AUTH_MW_BINDING_KEY]: Binding.bind({
          key: AuthenticateComponent.AUTH_MW_BINDING_KEY,
        })
          .toProvider(AuthenticateMiddleware)
          .setScope(BindingScopes.SINGLETON),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    const authenticateOptions = this.application.get<IAuthenticateOptions>({
      key: AuthenticateBindingKeys.AUTHENTICATE_OPTIONS,
    });
    this.application
      .bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS })
      .toValue(authenticateOptions.tokenOptions);
    this.application.service(JWTTokenService);

    const server = this.application.getServer();
    const mw = this.application.get<MiddlewareHandler>({
      key: AuthenticateComponent.AUTH_MW_BINDING_KEY,
    });
    server.use(mw);
  }
}
