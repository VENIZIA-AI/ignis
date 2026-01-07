import { TContext } from '@/base/controllers';
import { inject } from '@/base/metadata';
import { BaseHelper } from '@venizia/ignis-helpers';
import { Env } from 'hono';
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
 * authenticate: { strategies: ['basic'] }
 * // Or with JWT fallback
 * authenticate: { strategies: ['jwt', 'basic'], mode: 'any' }
 * ```
 */
export class BasicAuthenticationStrategy<E extends Env = Env>
  extends BaseHelper
  implements IAuthenticationStrategy<E>
{
  name = Authentication.STRATEGY_BASIC;

  constructor(
    @inject({ key: 'services.BasicTokenService' }) private service: BasicTokenService<E>,
  ) {
    super({ scope: BasicAuthenticationStrategy.name });
  }

  async authenticate(context: TContext<string, E>): Promise<IAuthUser> {
    const credentials = this.service.extractCredentials(context);
    return this.service.verify({ credentials, context });
  }
}
