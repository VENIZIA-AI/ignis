import { TContext } from '@/base';
import { inject } from '@/base/metadata';
import { BaseService } from '@/base/services';
import { getError, HTTP } from '@venizia/ignis-helpers';
import { Env } from 'hono';
import { Authentication } from '../common/constants';
import { AuthenticateBindingKeys, IAuthUser, IBasicTokenServiceOptions } from '../common';

/**
 * Service for handling Basic Authentication.
 *
 * Extracts credentials from the `Authorization: Basic <base64>` header,
 * decodes them, and verifies using the provided verification function.
 *
 * @example
 * ```typescript
 * // Register with options
 * this.bind<IBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS })
 *   .toValue({
 *     verifyCredentials: async (creds, ctx) => {
 *       const user = await userRepo.findByUsername(creds.username);
 *       if (user && await bcrypt.compare(creds.password, user.passwordHash)) {
 *         return { userId: user.id, roles: user.roles };
 *       }
 *       return null;
 *     },
 *   });
 * this.service(BasicTokenService);
 * ```
 */
export class BasicTokenService<E extends Env = Env> extends BaseService {
  private verifyCredentials: IBasicTokenServiceOptions<E>['verifyCredentials'];

  constructor(
    @inject({ key: AuthenticateBindingKeys.BASIC_OPTIONS })
    protected options: IBasicTokenServiceOptions<E>,
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

  // --------------------------------------------------------------------------------------
  /**
   * Extract credentials from Authorization header.
   *
   * Expected format: `Authorization: Basic base64(username:password)`
   *
   * @param context - The Hono request context
   * @returns The extracted username and password
   * @throws 401 Unauthorized if header is missing, invalid schema, or invalid format
   */
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
      this.logger.debug('[extractCredentials] Failed to decode credentials | Error: %s', error);
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Unauthorized! Invalid base64 credentials format',
      });
    }
  }

  // --------------------------------------------------------------------------------------
  /**
   * Verify credentials using the provided verification function.
   *
   * @param credentials - The extracted username and password
   * @param context - The Hono request context
   * @returns The authenticated user
   * @throws 401 Unauthorized if credentials are invalid
   */
  async verify(opts: {
    credentials: { username: string; password: string };
    context: TContext<E, string>;
  }): Promise<IAuthUser> {
    const user = await this.verifyCredentials(opts);

    if (!user) {
      this.logger.debug('[verify] Invalid credentials for username: %s', opts.credentials.username);

      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Unauthorized! Invalid username or password',
      });
    }

    return user;
  }
}
