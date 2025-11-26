import { BaseHelper } from '@/base/helpers';
import { IProvider } from '@/common/types';
import { getError } from '@/helpers/error';
import { Container } from '@/helpers/inversion';
import { createMiddleware } from 'hono/factory';
import { MiddlewareHandler } from 'hono/types';
import { AuthenticateBindingKeys } from './keys';
import { IAuthenticateOptions } from './types';

export class AuthenticateMiddleware extends BaseHelper implements IProvider<MiddlewareHandler> {
  constructor() {
    super({ scope: AuthenticateMiddleware.name });
  }

  value(container?: Container): MiddlewareHandler {
    if (!container) {
      throw getError({
        message: '[AuthenticateMiddleware] Invalid DI Container to init middleware!',
      });
    }

    const mw = createMiddleware(async (context, next) => {
      const requestPath = context.req.path;

      const authenticateOptions = container.get<IAuthenticateOptions>({
        key: AuthenticateBindingKeys.AUTHENTICATE_OPTIONS,
      });
      const alwaysAllowPaths = new Set(authenticateOptions.alwaysAllowPaths);
      if (!alwaysAllowPaths.has(requestPath)) {
        // Do authenticate
      }

      await next();
    });

    return mw;
  }
}
