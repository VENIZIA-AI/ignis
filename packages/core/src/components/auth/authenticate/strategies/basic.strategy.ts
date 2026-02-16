import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import { BaseHelper } from '@venizia/ignis-helpers';
import { Env } from 'hono';
import { Authentication, IAuthUser, IAuthenticationStrategy } from '../common';
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

  async authenticate(context: TContext<E, string>): Promise<IAuthUser> {
    const credentials = this.service.extractCredentials(context);
    return this.service.verify({ credentials, context });
  }
}
