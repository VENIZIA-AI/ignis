import { BindingScopes, Container } from '@/helpers/inversion';
import { BaseHelper, getError, HTTP, TClass } from '@venizia/ignis-helpers';
import { Context, Env, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import isEmpty from 'lodash/isEmpty';
import {
  Authentication,
  AuthenticationModes,
  IAuthenticationStrategy,
  IAuthUser,
  TAuthMode,
} from '../common';

export class AuthenticationStrategyRegistry<E extends Env = Env> extends BaseHelper {
  private static instance: AuthenticationStrategyRegistry;

  private strategies: Map<
    string,
    {
      container: Container;
      strategyClass: TClass<IAuthenticationStrategy<E>>;
    }
  >;

  // ------------------------------------------------------------------------------
  constructor() {
    super({ scope: AuthenticationStrategyRegistry.name });
    this.strategies = new Map();
  }

  static getInstance() {
    if (!AuthenticationStrategyRegistry.instance) {
      AuthenticationStrategyRegistry.instance = new AuthenticationStrategyRegistry();
    }

    return AuthenticationStrategyRegistry.instance;
  }

  // ------------------------------------------------------------------------------
  getStrategyKey(opts: { name: string }) {
    if (!opts?.name || isEmpty(opts.name)) {
      throw getError({ message: `[getStrategyKey] Invalid strategy name | name: ${opts.name}` });
    }

    return [Authentication.AUTHENTICATION_STRATEGY, opts.name].join('.');
  }

  getStrategy(opts: { container: Container; name: string }) {
    const { container, name } = opts;
    return container.get<IAuthenticationStrategy>({
      key: this.getStrategyKey({ name }),
      isOptional: false,
    });
  }

  // ------------------------------------------------------------------------------
  register(opts: {
    container: Container;
    strategies: { strategy: TClass<IAuthenticationStrategy<E>>; name: string }[];
  }) {
    const { container, strategies } = opts;

    for (const { strategy, name } of strategies) {
      this.strategies.set(name, { container, strategyClass: strategy });
      container
        .bind({
          key: [Authentication.AUTHENTICATION_STRATEGY, name].join('.'),
        })
        .toClass(strategy)
        .setScope(BindingScopes.SINGLETON);
    }

    return this;
  }

  // ------------------------------------------------------------------------------
  authenticate(opts: { strategies: string[]; mode?: TAuthMode }): MiddlewareHandler {
    const { strategies, mode = 'any' } = opts;

    const mw = createMiddleware(async (context, next) => {
      const isSkipAuthenticate = context.get(Authentication.SKIP_AUTHENTICATION);
      if (isSkipAuthenticate) {
        const path = context.req.path;
        this.logger
          .for(this.authenticate.name)
          .debug('SKIP checking authentication | action: %s', path);
        return next();
      }

      const isAuthenticated = context.get(Authentication.CURRENT_USER);
      if (isAuthenticated) {
        return next();
      }

      switch (mode) {
        case AuthenticationModes.ANY: {
          // FALLBACK MODE: first success wins
          const errors: Error[] = [];
          for (const strategyName of strategies) {
            try {
              const user = await this.executeStrategy({ context, strategyName });
              context.set(Authentication.CURRENT_USER, user);
              if (user?.userId) {
                context.set(Authentication.AUDIT_USER_ID, user.userId);
              }

              await next();
              return;
            } catch (error) {
              this.logger
                .for(this.authenticate.name)
                .debug('Strategy %s failed, trying next...', strategyName);
              errors.push(error as Error);
            }
          }

          // All strategies failed
          throw getError({
            statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
            message: `Authentication failed. Tried strategies: ${strategies.join(', ')}`,
          });
        }
        case AuthenticationModes.ALL: {
          // ALL MODE: all strategies must pass
          let authUser: IAuthUser | null = null;
          for (const strategyName of strategies) {
            const user = await this.executeStrategy({ context, strategyName });
            authUser = user;
          }

          if (authUser?.userId) {
            context.set(Authentication.CURRENT_USER, authUser);
            context.set(Authentication.AUDIT_USER_ID, authUser.userId);
          } else {
            this.logger
              .for(this.authenticate.name)
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
        default: {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: `Invalid authentication mode | mode: ${mode}`,
          });
        }
      }
    });

    return mw;
  }

  // ------------------------------------------------------------------------------
  private executeStrategy(opts: { context: Context<E>; strategyName: string }): Promise<IAuthUser> {
    const { context, strategyName } = opts;
    const strategyMetadata = this.strategies.get(strategyName);

    if (!strategyMetadata) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[executeStrategy] Strategy not found: ${strategyName}`,
      });
    }

    const { container } = strategyMetadata;
    const strategy = container.get<IAuthenticationStrategy<E>>({
      key: [Authentication.AUTHENTICATION_STRATEGY, strategyName].join('.'),
    });

    if (!strategy) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[executeStrategy] strategy: ${strategyName} | Authentication Strategy NOT FOUND`,
      });
    }

    return strategy.authenticate(context);
  }
}

export const authenticate = (opts: { strategies: string[]; mode?: TAuthMode }) => {
  return AuthenticationStrategyRegistry.getInstance().authenticate(opts);
};
