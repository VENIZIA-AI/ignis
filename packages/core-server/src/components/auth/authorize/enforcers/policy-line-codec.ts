import { getError } from '@venizia/ignis-helpers/core';
import {
  CasbinRuleVariants,
  type IAuthorizationUser,
  type ICasbinEnforcerOptions,
} from '@venizia/ignis-kernel';
import type {
  Enforcer as CasbinEnforcerType,
  Helper as CasbinHelperType,
  Model as CasbinModelType,
} from 'casbin';

/**
 * Serializes casbin policy state to/from plain string lines. Pure - no pool, no cache, no
 * lifecycle; every method takes exactly what it needs from the caller instead of holding state.
 */
export class PolicyLineCodec {
  /** Extract a user's lines from an ISOLATED throwaway enforcer (own model + adapter), never a pooled serving one, so concurrent requests cannot change what we cache. */
  static async extractUserLines(opts: {
    casbin: typeof import('casbin');
    model: CasbinModelType;
    adapter: ICasbinEnforcerOptions['adapter'];
    user: IAuthorizationUser;
  }): Promise<string[]> {
    const { casbin, model, adapter, user } = opts;
    const loader = await casbin.newEnforcer(model, adapter);

    if (!loader.loadFilteredPolicy) {
      throw getError({
        message: '[PolicyLineCodec] Adapter does not support loadFilteredPolicy.',
      });
    }

    await loader.loadFilteredPolicy({
      principal: { type: user.principalType, id: user.userId },
    });

    return PolicyLineCodec.extractLinesFrom({ enforcer: loader });
  }

  /** Serialize ALL p-types and g-types (not just `p`/`g`) back into casbin lines so the cached payload is complete for the scoped model; it reads stored rules, so the loader needs no matching funcs registered. */
  static async extractLinesFrom(opts: { enforcer: CasbinEnforcerType }): Promise<string[]> {
    const { enforcer } = opts;
    const model = enforcer.getModel();
    const lines: string[] = [];

    const policyTypes = model.model.get(CasbinRuleVariants.P);
    for (const ptype of policyTypes?.keys() ?? []) {
      const rules = await enforcer.getNamedPolicy(ptype);
      for (const rule of rules) {
        lines.push([ptype, ...rule].join(', '));
      }
    }

    const groupingTypes = model.model.get(CasbinRuleVariants.G);
    for (const gtype of groupingTypes?.keys() ?? []) {
      const rules = await enforcer.getNamedGroupingPolicy(gtype);
      for (const rule of rules) {
        lines.push([gtype, ...rule].join(', '));
      }
    }

    return lines;
  }

  /** Atomically reset a borrowed enforcer's model to exactly `lines` + rebuild role links. */
  static async loadLinesIntoModel(opts: {
    enforcer: CasbinEnforcerType;
    lines: string[];
    helper: typeof CasbinHelperType;
  }): Promise<void> {
    const model = opts.enforcer.getModel();
    model.clearPolicy();

    for (const line of opts.lines) {
      opts.helper.loadPolicyLine(line, model);
    }

    await opts.enforcer.buildRoleLinks();
  }
}
