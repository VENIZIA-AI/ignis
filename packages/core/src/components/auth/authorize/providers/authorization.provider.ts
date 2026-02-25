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
    const logger = this.logger.for(this.createAuthorizeMiddleware.name);

    return createMiddleware(async (context, next) => {
      const registry = AuthorizationEnforcerRegistry.getInstance();
      const options = registry.resolveOptions();

      // 1. Check skip flag
      const isSkipAuthorize = context.get(Authorization.SKIP_AUTHORIZATION);
      if (isSkipAuthorize) {
        logger.warn('SKIP checking authorization | path: %s', context.req.path);
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

      // 3. Check role-based shortcuts (alwaysAllowRoles + per-route allowedRoles)
      const needsRoleCheck = options?.alwaysAllowRoles?.length || spec.allowedRoles?.length;
      if (needsRoleCheck) {
        const userRoles = this.extractUserRoles({ user });

        if (
          options?.alwaysAllowRoles?.length &&
          userRoles.some(r => options.alwaysAllowRoles!.includes(r))
        ) {
          logger.warn(
            'SKIP checking authorization | User has always-allow role | userRoles: %s',
            userRoles,
          );
          return next();
        }

        if (spec.allowedRoles?.length && userRoles.some(r => spec.allowedRoles!.includes(r))) {
          logger.warn('GRANT access | User has allowed role for route | userRoles: %s', userRoles);
          return next();
        }
      }

      // 4. Execute voters
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

      // 5. Resolve enforcer
      const resolvedName = enforcerName ?? registry.getDefaultEnforcerName();
      const enforcer = await registry.resolveEnforcer({ name: resolvedName });

      // 6. Build or retrieve cached rules
      let rules = context.get(Authorization.RULES);
      if (!rules) {
        if (!user.principalType) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_4.BadRequest,
            message:
              'Authorization failed: user.principalType is required for enforcer-based authorization',
          });
        }

        rules = await enforcer.buildRules({
          user: user as { principalType: string } & IAuthUser,
          context: asTypedContext(context),
        });
        context.set(Authorization.RULES, rules);
      }

      // 7. Evaluate permission via enforcer
      let decision = await enforcer.evaluate({
        rules,
        request: {
          action: spec.action,
          resource: spec.resource,
          conditions: spec.conditions,
        },
        context: asTypedContext(context),
      });

      if (decision === AuthorizationDecisions.ABSTAIN) {
        decision = options?.defaultDecision ?? AuthorizationDecisions.DENY;
      }

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
