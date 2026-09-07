import { asTypedContext } from '@/base/controllers/context';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type { IProvider } from '@venizia/ignis-inversion';
import { createMiddleware } from 'hono/factory';
import type { IAuthUser } from '../../authenticate/common/types';
// Deep import (not the authenticate barrel): the barrel re-exports ./controllers, whose factory extends BaseRestController - a value import here forms the base/controllers <-> auth init cycle.
import { Authentication } from '../../authenticate/common/constants';
import type { IAuthorizationSpec, TAuthorizeFn } from '../common';
import { Authorization, AuthorizationDecisions, AuthorizationErrors } from '../common';
import { AuthorizationEnforcerRegistry } from '../enforcers/enforcer-registry';
import { resolveRequestDomain } from './request-domain';

export class AuthorizationProvider extends BaseHelper implements IProvider<TAuthorizeFn> {
  constructor() {
    super({ scope: AuthorizationProvider.name });
  }

  value(): TAuthorizeFn {
    return opts => {
      return this.createAuthorizeMiddleware(opts);
    };
  }

  private createAuthorizeMiddleware(opts: { spec: IAuthorizationSpec; enforcerName?: string }) {
    const { spec, enforcerName } = opts;
    const logger = this.logger.for(this.createAuthorizeMiddleware.name);

    return createMiddleware(async (context, next) => {
      const registry = AuthorizationEnforcerRegistry.getInstance();
      const options = registry.resolveOptions();

      const isSkipAuthorize = context.get(Authorization.SKIP_AUTHORIZATION);
      if (isSkipAuthorize) {
        logger.warn('SKIP checking authorization | path: %s', context.req.path);
        return next();
      }

      const user = context.get(Authentication.CURRENT_USER) as IAuthUser | undefined;
      if (!user) {
        throw getError({
          error: AuthorizationErrors.UNAUTHENTICATED,
          message: 'Authorization failed: No authenticated user found',
        });
      }

      const needsRoleCheck =
        Boolean(options?.alwaysAllowRoles?.length) || Boolean(spec.allowedRoles?.length);
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

      for (const voter of spec.voters ?? []) {
        const decision = await voter({
          user,
          action: spec.action,
          resource: spec.resource,
          context: asTypedContext(context),
        });

        if (decision === AuthorizationDecisions.DENY) {
          throw getError({
            error: AuthorizationErrors.DENIED_BY_VOTER,
            message: `Authorization denied by voter | action: ${spec.action} | resource: ${spec.resource}`,
            messageArgs: { action: spec.action, resource: spec.resource },
          });
        }

        if (decision === AuthorizationDecisions.ALLOW) {
          await next();
          return;
        }

        // ABSTAIN → continue to enforcer
      }

      if (!registry.hasEnforcers()) {
        const noEnforcerDecision = options?.defaultDecision ?? AuthorizationDecisions.DENY;

        if (noEnforcerDecision === AuthorizationDecisions.ALLOW) {
          logger.warn(
            'ALLOW checking authorization | No enforcers registered | path: %s',
            context.req.path,
          );
          return next();
        }

        throw getError({
          error: AuthorizationErrors.ENFORCER_NOT_REGISTERED,
          message: `Authorization failed: authorize() was declared for this route but no enforcer is registered | path: ${context.req.path}`,
        });
      }

      const resolvedName = enforcerName ?? registry.getDefaultEnforcerName();
      const enforcer = await registry.resolveEnforcer({ name: resolvedName });

      // Only resolve domain scope when it is actually in play (per-route domain OR a configured global resolver) - avoids a resolver call (possible DB hit) for legacy enforcers.
      //
      // Held in a LOCAL, not read back out of the context. One middleware is pushed per spec onto
      // the same Hono context, so reading `Authorization.DOMAIN` at decision time meant a
      // domain-less spec inherited the tenant domain a PREVIOUS spec had written - silently
      // widening a check that should have run at SYSTEM_WIDE. The context is still set, for
      // observability, but nothing decides on it.
      const domainScope =
        spec.domain || options?.domainResolver
          ? await resolveRequestDomain({
              spec,
              context: asTypedContext(context),
              options,
            })
          : undefined;
      context.set(Authorization.DOMAIN, domainScope);

      // Keyed by enforcer. The slot used to hold one rule set for the whole request, so a second
      // `authorize()` naming a DIFFERENT enforcer evaluated against the first enforcer's rules -
      // granting where its own policy set denies.
      //
      // `instanceof Map`, not a truthiness test: the slot previously held a bare rule set, so
      // anything that pre-populates it with the old shape would otherwise reach `.get` on a value
      // that has no such method and take the request down with a TypeError.
      const existingRules = context.get(Authorization.RULES);
      const rulesByEnforcer =
        existingRules instanceof Map ? existingRules : new Map<string, unknown>();
      let rules = rulesByEnforcer.get(resolvedName);

      if (!rules) {
        if (!user.principalType) {
          throw getError({
            error: AuthorizationErrors.PRINCIPAL_TYPE_MISSING,
            message:
              'Authorization failed: user.principalType is required for enforcer-based authorization',
          });
        }

        rules = await enforcer.buildRules({
          user: user as { principalType: string } & IAuthUser,
          context: asTypedContext(context),
        });
        rulesByEnforcer.set(resolvedName, rules);
        context.set(Authorization.RULES, rulesByEnforcer);
      }

      let decision = await enforcer.evaluate({
        rules,
        request: {
          action: spec.action,
          resource: spec.resource,
          conditions: spec.conditions,
          domain: domainScope,
        },
        context: asTypedContext(context),
      });

      if (decision === AuthorizationDecisions.ABSTAIN) {
        decision = options?.defaultDecision ?? AuthorizationDecisions.DENY;
      }

      if (decision !== AuthorizationDecisions.ALLOW) {
        throw getError({
          error: AuthorizationErrors.DENIED,
          message: `Authorization denied | action: ${spec.action} | resource: ${spec.resource}`,
          messageArgs: { action: spec.action, resource: spec.resource },
        });
      }

      await next();
    });
  }

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
