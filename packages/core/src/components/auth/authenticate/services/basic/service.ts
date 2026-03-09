import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import { BaseService } from '@/base/services/base';
import { getError, HTTP } from '@venizia/ignis-helpers';
import { Env } from 'hono';
import {
  Authentication,
  AuthenticateBindingKeys,
  IAuthUser,
  TBasicTokenServiceOptions,
} from '../../common';

/** Extracts and verifies Basic auth credentials from the Authorization header. */
export class BasicTokenService<E extends Env = Env> extends BaseService {
  protected verifyCredentials: TBasicTokenServiceOptions<E>['verifyCredentials'];

  constructor(
    @inject({ key: AuthenticateBindingKeys.BASIC_OPTIONS })
    protected options: TBasicTokenServiceOptions<E>,
  ) {
    super({ scope: BasicTokenService.name });

    if (!options?.verifyCredentials) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[BasicTokenService] Invalid verifyCredentials function',
      });
    }

    this.verifyCredentials = options.verifyCredentials;
  }

  /** Extracts username:password from Base64-encoded Authorization header. */
  extractCredentials(context: TContext<E, string>): { username: string; password: string } {
    const authHeaderValue = context.req.header('Authorization');

    if (!authHeaderValue) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Unauthorized! Missing authorization header',
      });
    }

    if (!authHeaderValue.startsWith(Authentication.TYPE_BASIC)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Unauthorized! Invalid authorization schema, expected Basic',
      });
    }

    const parts = authHeaderValue.split(' ');
    if (parts.length !== 2) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Unauthorized! Invalid authorization header format',
      });
    }

    const [, base64Credentials] = parts;

    try {
      const decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const colonIndex = decoded.indexOf(':');

      if (colonIndex === -1) {
        throw new Error('Invalid format: missing colon separator');
      }

      const username = decoded.substring(0, colonIndex);
      const password = decoded.substring(colonIndex + 1);

      if (!username) {
        throw new Error('Username is empty');
      }

      return { username, password };
    } catch (error) {
      this.logger
        .for(this.extractCredentials.name)
        .debug('Failed to decode credentials | Error: %s', error);
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Unauthorized! Invalid base64 credentials format',
      });
    }
  }

  /** Verifies credentials via the user-provided verification function. */
  async verify(opts: {
    credentials: { username: string; password: string };
    context: TContext<E, string>;
  }): Promise<IAuthUser> {
    const user = await this.verifyCredentials(opts);

    if (!user) {
      this.logger
        .for(this.verify.name)
        .debug('Invalid credentials for username: %s', opts.credentials.username);

      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Unauthorized! Invalid username or password',
      });
    }

    return user;
  }
}
