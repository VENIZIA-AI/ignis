import { TContext } from '@/base/controllers/common/types';
import { BaseHelper, getError, HTTP } from '@venizia/ignis-helpers';
import { IProvider } from '@venizia/ignis-inversion';
import { Env } from 'hono';
import { createMiddleware } from 'hono/factory';
import {
  Authentication,
  AuthenticationModes,
  IAuthUser,
  TAuthenticateFn,
  TAuthMode,
} from '../common';
import { AuthenticationStrategyRegistry } from '../strategies';

// Authentication Provider — produces middleware factory via IProvider pattern

export class AuthenticationProvider<RouteEnv extends Env = Env>
  extends BaseHelper
  implements IProvider<TAuthenticateFn<RouteEnv>>
{
  constructor() {
    super({ scope: AuthenticationProvider.name });
  }

  value(): TAuthenticateFn<RouteEnv> {
    return opts => {
      return this.createAuthenticateMiddleware(opts);
    };
  }

  private createAuthenticateMiddleware(opts: { strategies: string[]; mode?: TAuthMode }) {
    const { strategies, mode = AuthenticationModes.ANY } = opts;
    const registry = AuthenticationStrategyRegistry.getInstance();

    return createMiddleware(async (context, next) => {
      // 1. Check skip flag
      const isSkipAuthenticate = context.get(Authentication.SKIP_AUTHENTICATION);
      if (isSkipAuthenticate) {
        this.logger
          .for(this.createAuthenticateMiddleware.name)
          .debug('SKIP checking authentication | path: %s', context.req.path);
        return next();
      }

      // 2. Check if already authenticated
      const isAuthenticated = context.get(Authentication.CURRENT_USER);
      if (isAuthenticated) {
        return next();
      }

      // 3. Execute strategies based on mode
      switch (mode) {
        case AuthenticationModes.ANY: {
          await this.executeAnyMode({
            context: context as TContext,
            strategies,
            registry,
            next,
          });
          return;
        }
        case AuthenticationModes.ALL: {
          await this.executeAllMode({
            context: context as TContext,
            strategies,
            registry,
            next,
          });
          return;
        }
        default: {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: `Invalid authentication mode | mode: ${mode}`,
          });
        }
      }
    });
  }

  private async executeAnyMode(opts: {
    context: TContext;
    strategies: string[];
    registry: AuthenticationStrategyRegistry;
    next: () => Promise<void>;
  }) {
    const { context, strategies, registry, next } = opts;

    for (const strategyName of strategies) {
      try {
        const strategy = registry.resolveStrategy({ name: strategyName });
        const user = await strategy.authenticate(context);
        this.setCurrentUser({ context, user });
        break;
      } catch (error) {
        this.logger
          .for(this.executeAnyMode.name)
          .debug('Strategy %s failed, trying next... | Error: %s', strategyName, error);
      }
    }

    const currentUser = context.get(Authentication.CURRENT_USER);
    if (!currentUser) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: `Authentication failed. Tried strategies: ${strategies.join(', ')}`,
      });
    }

    await next();
  }

  private async executeAllMode(opts: {
    context: TContext;
    strategies: string[];
    registry: AuthenticationStrategyRegistry;
    next: () => Promise<void>;
  }) {
    const { context, strategies, registry, next } = opts;

    // Use the first strategy's user as the identity source — all must succeed but first wins for identity
    let authUser: IAuthUser | null = null;

    for (const strategyName of strategies) {
      const strategy = registry.resolveStrategy({ name: strategyName });
      const user = await strategy.authenticate(context);

      if (!authUser) {
        authUser = user;
      }
    }

    if (authUser?.userId) {
      this.setCurrentUser({ context, user: authUser });
    } else {
      this.logger
        .for(this.executeAllMode.name)
        .error(
          'Failed to identify authenticated user | user: %j | userId: %s',
          authUser,
          authUser?.userId,
        );
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Failed to identify authenticated user!',
      });
    }

    return next();
  }

  private setCurrentUser(opts: { context: TContext; user: IAuthUser }) {
    const { context, user } = opts;
    context.set(Authentication.CURRENT_USER, user);

    if (user?.userId) {
      context.set(Authentication.AUDIT_USER_ID, user.userId);
    }
  }
}
