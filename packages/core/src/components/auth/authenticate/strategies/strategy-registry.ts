import {
  BaseHelper,
  BindingScopes,
  Container,
  getError,
  HTTP,
  TClass,
} from '@venizia/ignis-helpers';
import { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import isEmpty from 'lodash/isEmpty';
import {
  AuthenticateBindingKeys,
  Authentication,
  IAuthenticateOptions,
  IAuthenticationStrategy,
} from '../common';

export class AuthenticationStrategyRegistry extends BaseHelper {
  private static instance: AuthenticationStrategyRegistry;

  private strategies: Map<
    string,
    {
      container: Container;
      strategyClass: TClass<IAuthenticationStrategy>;
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
    strategy: TClass<IAuthenticationStrategy>;
    name: string;
  }) {
    const { container, name, strategy: strategyClass } = opts;

    this.strategies.set(name, { container, strategyClass });
    container
      .bind({
        key: [Authentication.AUTHENTICATION_STRATEGY, name].join('.'),
      })
      .toClass(strategyClass)
      .setScope(BindingScopes.SINGLETON);

    return this;
  }

  // ------------------------------------------------------------------------------
  authenticate(opts: { strategy: string }): MiddlewareHandler {
    const mw = createMiddleware(async (context, next) => {
      const isSkipAuthenticate = context.get(Authentication.SKIP_AUTHENTICATION);
      if (isSkipAuthenticate) {
        const path = context.req.path;
        this.logger.debug('[authenticate] SKIP checking authentication | action: %s', path);
        return next();
      }

      const isAuthenticated = context.get(Authentication.CURRENT_USER);
      if (isAuthenticated) {
        return next();
      }

      const { strategy: strategyName } = opts;
      const strategyMetadata = this.strategies.get(strategyName);
      if (!strategyMetadata) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[authenticate] strategy: ${strategyName} | Authentication Strategy Metadata NOT FOUND`,
        });
      }

      const { container } = strategyMetadata;

      const requestPath = context.req.path;
      const authenticateOptions = container.get<IAuthenticateOptions>({
        key: AuthenticateBindingKeys.AUTHENTICATE_OPTIONS,
      });

      if (!authenticateOptions) {
        throw getError({
          message: '[authenticate][mw] Failed to authenticate rquest | Invalid authenticateOptions',
        });
      }

      const alwaysAllowPaths = new Set(authenticateOptions.alwaysAllowPaths);
      if (alwaysAllowPaths.has(requestPath)) {
        return next();
      }

      const strategy = container.get<IAuthenticationStrategy>({
        key: [Authentication.AUTHENTICATION_STRATEGY, strategyName].join('.'),
      });

      if (!strategy) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[authenticate] strategy: ${strategyName} | Authentication Strategy NOT FOUND`,
        });
      }

      const user = await strategy.authenticate(context);
      context.set(Authentication.CURRENT_USER, user);

      return next();
    });

    return mw;
  }
}

export const authenticate = (opts: { strategy: string }) => {
  return AuthenticationStrategyRegistry.getInstance().authenticate(opts);
};
