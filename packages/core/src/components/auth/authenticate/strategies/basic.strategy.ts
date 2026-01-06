import { inject } from '@/base/metadata';
import { BaseHelper } from '@venizia/ignis-helpers';
import { Context, Env, Input } from 'hono';
import { IAuthUser, IAuthenticationStrategy } from '../common';
import { Authentication } from '../common/constants';
import { BasicTokenService } from '../services';

/**
 * Basic Authentication Strategy.
 *
 * Implements HTTP Basic Authentication by extracting credentials from
 * the `Authorization: Basic <base64>` header and verifying them using
 * a user-provided verification function.
 *
 * @example
 * ```typescript
 * // Register the strategy
 * AuthenticationStrategyRegistry.getInstance().register({
 *   container: this,
 *   name: Authentication.STRATEGY_BASIC,
 *   strategy: BasicAuthenticationStrategy,
 * });
 *
 * // Use in routes
 * authStrategies: ['basic']
 * // Or with JWT fallback
 * authStrategies: ['jwt', 'basic'], authMode: 'any'
 * ```
 */
export class BasicAuthenticationStrategy<
  E extends Env = any,
  P extends string = any,
  I extends Input = {},
>
  extends BaseHelper
  implements IAuthenticationStrategy<E, P, I>
{
  name = Authentication.STRATEGY_BASIC;

  constructor(@inject({ key: 'services.BasicTokenService' }) private service: BasicTokenService) {
    super({ scope: BasicAuthenticationStrategy.name });
  }

  async authenticate(context: Context): Promise<IAuthUser> {
    const credentials = this.service.extractCredentials(context);
    return this.service.verify({ credentials, context });
  }
}
