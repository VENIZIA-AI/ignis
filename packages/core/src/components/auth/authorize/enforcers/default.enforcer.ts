import { TContext } from '@/base/controllers/common/types';
import { inject } from '@/base/metadata/injectors';
import { BaseHelper } from '@venizia/ignis-helpers';
import { IAuthUser } from '../../authenticate';
import {
  AuthorizationActions,
  AuthorizationDecisions,
  AuthorizeBindingKeys,
  IAbilityBuilder,
  IAuthorizationEnforcer,
  IAuthorizeOptions,
  IPermissionRule,
  TAuthorizationConditions,
} from '../common';

// --------------------------------------------------------------------------------------------------------
// AbilityBuilder — uses allow/deny (not can/cannot)
// --------------------------------------------------------------------------------------------------------

export class AbilityBuilder implements IAbilityBuilder {
  private rules: IPermissionRule[] = [];

  allow(opts: { action: string; resource: string; conditions?: TAuthorizationConditions }): void {
    const { action, resource, conditions } = opts;
    this.rules.push({ action, resource, effect: AuthorizationDecisions.ALLOW, conditions });
  }

  deny(opts: { action: string; resource: string; conditions?: TAuthorizationConditions }): void {
    const { action, resource, conditions } = opts;
    this.rules.push({ action, resource, effect: AuthorizationDecisions.DENY, conditions });
  }

  build(): IPermissionRule[] {
    return [...this.rules];
  }
}

// --------------------------------------------------------------------------------------------------------
// Default Authorization Enforcer — zero-dep, simple RBAC/ABAC
// --------------------------------------------------------------------------------------------------------

export class DefaultAuthorizationEnforcer
  extends BaseHelper
  implements IAuthorizationEnforcer<IPermissionRule[]>
{
  name = 'default';

  constructor(@inject({ key: AuthorizeBindingKeys.OPTIONS }) private options: IAuthorizeOptions) {
    super({ scope: DefaultAuthorizationEnforcer.name });
  }

  // ---------------------------------------------------------------------------
  async buildAbilities(opts: { user: IAuthUser; context: TContext }): Promise<IPermissionRule[]> {
    const { user, context } = opts;

    // Priority: loadPermissions (DB-driven) > defineAbilitiesFor (static)
    if (this.options.loadPermissions) {
      return this.options.loadPermissions({ user, context });
    }

    if (this.options.defineAbilitiesFor) {
      const builder = new AbilityBuilder();
      this.options.defineAbilitiesFor({ user, builder });
      return builder.build();
    }

    this.logger
      .for(this.buildAbilities.name)
      .warn(
        'No ability definition found — neither defineAbilitiesFor nor loadPermissions provided',
      );

    return [];
  }

  // ---------------------------------------------------------------------------
  evaluate(opts: {
    abilities: IPermissionRule[];
    action: string;
    resource: string;
    conditions?: TAuthorizationConditions;
  }): boolean {
    const { action, resource, conditions } = opts;
    const rules = opts.abilities;

    if (!rules || rules.length === 0) {
      return this.options.defaultDecision === AuthorizationDecisions.ALLOW;
    }

    // Find matching rules
    const matchingRules = rules.filter(rule => {
      return (
        this.matchesAction({ ruleAction: rule.action, requestedAction: action }) &&
        this.matchesResource({ ruleResource: rule.resource, requestedResource: resource }) &&
        this.matchesConditions({ ruleConditions: rule.conditions, requestConditions: conditions })
      );
    });

    if (matchingRules.length === 0) {
      return this.options.defaultDecision === AuthorizationDecisions.ALLOW;
    }

    // Deny takes precedence over allow
    const hasDeny = matchingRules.some(rule => rule.effect === AuthorizationDecisions.DENY);
    if (hasDeny) {
      return false;
    }

    const hasAllow = matchingRules.some(rule => rule.effect === AuthorizationDecisions.ALLOW);
    return hasAllow;
  }

  // ---------------------------------------------------------------------------
  private matchesAction(opts: { ruleAction: string; requestedAction: string }): boolean {
    const { ruleAction, requestedAction } = opts;
    if (ruleAction === AuthorizationActions.MANAGE) {
      return true;
    }
    return ruleAction === requestedAction;
  }

  private matchesResource(opts: { ruleResource: string; requestedResource: string }): boolean {
    const { ruleResource, requestedResource } = opts;
    if (ruleResource === 'all') {
      return true;
    }
    return ruleResource === requestedResource;
  }

  private matchesConditions(opts: {
    ruleConditions?: TAuthorizationConditions;
    requestConditions?: TAuthorizationConditions;
  }): boolean {
    const { ruleConditions, requestConditions } = opts;

    // No conditions on rule → matches everything
    if (!ruleConditions || Object.keys(ruleConditions).length === 0) {
      return true;
    }

    // Rule has conditions but request doesn't → no match
    if (!requestConditions) {
      return false;
    }

    return Object.entries(ruleConditions).every(([key, value]) => {
      return requestConditions[key] === value;
    });
  }
}
