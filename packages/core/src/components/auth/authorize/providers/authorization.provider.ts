import { asTypedContext } from '@/base/controllers/common/types';
import { BaseHelper, getError, HTTP } from '@venizia/ignis-helpers';
import { IProvider } from '@venizia/ignis-inversion';
import { createMiddleware } from 'hono/factory';
import { Authentication, IAuthUser } from '../../authenticate';
import { Authorization, AuthorizationDecisions, IAuthorizationSpec, TAuthorizeFn } from '../common';
import { AuthorizationEnforcerRegistry } from '../enforcers';

// --------------------------------------------------------------------------------------------------------
// Authorization Provider — produces middleware factory via IProvider pattern
// --------------------------------------------------------------------------------------------------------

export class AuthorizationProvider extends BaseHelper implements IProvider<TAuthorizeFn> {
  constructor() {
    super({ scope: AuthorizationProvider.name });
  }

  // ---------------------------------------------------------------------------
  value(): TAuthorizeFn {
    return opts => {
      return this.createAuthorizeMiddleware(opts);
    };
  }

  // ---------------------------------------------------------------------------
  private createAuthorizeMiddleware(opts: { spec: IAuthorizationSpec; enforcerName?: string }) {
    const { spec, enforcerName } = opts;
    const registry = AuthorizationEnforcerRegistry.getInstance();
    const options = registry.resolveOptions();

    return createMiddleware(async (context, next) => {
      // 1. Check skip flag
      const isSkipAuthorize = context.get(Authorization.SKIP_AUTHORIZATION);
      if (isSkipAuthorize) {
        this.logger
          .for(this.createAuthorizeMiddleware.name)
          .debug('SKIP checking authorization | path: %s', context.req.path);
        return next();
      }

      // 2. Get authenticated user
      const user = context.get(Authentication.CURRENT_USER) as IAuthUser | undefined;
      if (!user) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
          message: 'Authorization failed: No authenticated user found',
        });
      }

      // 3. Check alwaysAllowRoles (from pre-resolved options)
      if (options?.alwaysAllowRoles?.length) {
        const userRoles = this.extractUserRoles({ user });
        if (userRoles.some(r => options.alwaysAllowRoles!.includes(r))) {
          this.logger
            .for(this.createAuthorizeMiddleware.name)
            .debug('User has always-allow role, skipping authorization');
          return next();
        }
      }

      // 4. Check per-route allowedRoles
      if (spec.allowedRoles?.length) {
        const userRoles = this.extractUserRoles({ user });
        if (userRoles.some(r => spec.allowedRoles!.includes(r))) {
          this.logger
            .for(this.createAuthorizeMiddleware.name)
            .debug('User has allowed role for route, granting access');
          return next();
        }
      }

      // 5. Execute voters
      if (spec.voters?.length) {
        for (const voter of spec.voters) {
          const decision = await voter({
            user,
            action: spec.action,
            resource: spec.resource,
            context: asTypedContext(context),
          });

          if (decision === AuthorizationDecisions.DENY) {
            throw getError({
              statusCode: HTTP.ResultCodes.RS_4.Forbidden,
              message: `Authorization denied by voter | action: ${spec.action} | resource: ${spec.resource}`,
            });
          }

          if (decision === AuthorizationDecisions.ALLOW) {
            await next();
            return;
          }

          // ABSTAIN → continue to enforcer
        }
      }

      // 6. Resolve enforcer
      const resolvedName = enforcerName ?? registry.getDefaultEnforcerName();
      const enforcer = await registry.resolveAndConfigureEnforcer({ name: resolvedName });

      // 7. Build or retrieve cached rules
      let rules = context.get(Authorization.RULES);
      if (!rules) {
        rules = await enforcer.buildRules({
          user: user as { principalType: string } & IAuthUser,
          context: asTypedContext(context),
        });
        context.set(Authorization.RULES, rules);
      }

      // 8. Evaluate permission via enforcer
      const decision = await enforcer.evaluate({
        rules,
        request: {
          action: spec.action,
          resource: spec.resource,
          conditions: spec.conditions,
        },
        context: asTypedContext(context),
      });

      if (decision !== AuthorizationDecisions.ALLOW) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.Forbidden,
          message: `Authorization denied | action: ${spec.action} | resource: ${spec.resource}`,
        });
      }

      await next();
    });
  }

  // ---------------------------------------------------------------------------
  private extractUserRoles(opts: { user: IAuthUser }): string[] {
    const { user } = opts;
    const roles = user.roles;

    if (!Array.isArray(roles)) {
      return [];
    }

    return roles.map((r: string | { identifier?: string; name?: string; id?: unknown }) => {
      if (typeof r === 'string') {
        return r;
      }
      return r.identifier ?? r.name ?? String(r.id ?? '');
    });
  }
}
