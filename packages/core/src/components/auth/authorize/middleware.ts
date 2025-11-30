/* import { BaseHelper } from '@/base/helpers';
import { EErrorCode, ERegister } from '@/common/enums';
import { IProvider } from '@/common/types';
import { ApplicationError, Container } from '@/helpers';
import { createMiddleware } from 'hono/factory';
import { MiddlewareHandler } from 'hono/types';
import { ERole } from '../roles';
import { TJwtPayload } from '@/helpers/crypto/jwt';

export class AuthorizeMiddleware extends BaseHelper implements IProvider<MiddlewareHandler> {
  constructor(private readonly roles: ERole[]) {
    super({ scope: AuthorizeMiddleware.name });
  }

  value(_container?: Container): MiddlewareHandler {
    return createMiddleware(async (context, next) => {
      const user = context.get(ERegister.User) as TJwtPayload | undefined;
      if (!user) {
        throw new ApplicationError({
          statusCode: 401,
          message: 'Unauthorized',
          messageCode: EErrorCode.UNAUTHORIZED,
        });
      }

      const hasPermission = this.roles.some(role => user.roles.includes(role));
      if (!hasPermission) {
        throw new ApplicationError({
          statusCode: 403,
          message: 'Forbidden',
          messageCode: EErrorCode.FORBIDDEN,
        });
      }

      await next();
    });
  }
} */
