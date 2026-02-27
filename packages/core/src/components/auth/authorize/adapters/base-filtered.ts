import { BaseHelper, ValueOrPromise } from '@venizia/ignis-helpers';
import { type FilteredAdapter, type Model } from 'casbin';
import { CasbinRuleVariants } from '../common';
export interface IBaseFilteredAdapterEntities {
  role: { principalType: string };
  domain?: { principalType: string };
}

export interface ICasbinPolicyFilter {
  principalType: string;
  principalValue: string | number;
}

/**
 * Base policy row shape.
 *
 * Declared as `type` (not `interface`) so it carries an implicit index signature —
 * required by Drizzle's `connector.execute<T>()` which constrains `T extends Record<string, unknown>`.
 */
export type TBasePolicyRow = {
  variant: string;
  code: string;
  action: string | null;
  subjectType: string;
  subjectId: string | number;
  effect: string | null;
  domain: string | null;
};

// Base Filtered Adapter — read-only template for casbin FilteredAdapter
//
// Generic parameters (ordered by likelihood of customization):
//   TEntities  — entity configuration (subclass adds data-source-specific fields like tableName)
//   TFilter    — filter shape passed to loadFilteredPolicy (opaque to the base)
//   TPolicyRow — policy row shape consumed by toPolicyLine
//
// Subclasses implement the three query hooks; the base orchestrates loading,
// provides shared formatters, and satisfies the no-op write contract.

export abstract class BaseFilteredAdapter<
  TEntities extends IBaseFilteredAdapterEntities = IBaseFilteredAdapterEntities,
  TFilter = ICasbinPolicyFilter,
  TPolicyRow extends TBasePolicyRow = TBasePolicyRow,
>
  extends BaseHelper
  implements FilteredAdapter
{
  protected readonly entities: TEntities;

  constructor(opts: { scope: string; entities: TEntities }) {
    super({ scope: opts.scope });
    this.entities = opts.entities;
  }

  // FilteredAdapter — public API

  async loadPolicy(): Promise<void> {
    return;
  }

  async loadFilteredPolicy(model: Model, filter: TFilter): Promise<void> {
    const { Helper } = await import('casbin');
    const rolePrincipal = this.entities.role.principalType;
    const loadLine = (line: string) => Helper.loadPolicyLine(line, model);

    // 1. Direct permissions assigned to the principal
    const directLines = await this.buildDirectPolicies({ filter, rolePrincipal });
    directLines.forEach(loadLine);

    // 2. Role assignments + group lines
    const { lines: groupLines, roleIds } = await this.buildGroupPolicies({ filter });
    groupLines.forEach(loadLine);

    // 3. Permissions inherited through roles
    if (roleIds.length) {
      const roleLines = await this.buildRolePolicies({ roleIds, rolePrincipal });
      roleLines.forEach(loadLine);
    }
  }

  isFiltered(): boolean {
    return true;
  }

  // FilteredAdapter — no-op write methods (read-only adapter)

  async savePolicy(): Promise<boolean> {
    return true;
  }

  async addPolicy(): Promise<void> {
    return;
  }

  async removePolicy(): Promise<void> {
    return;
  }

  async removeFilteredPolicy(): Promise<void> {
    return;
  }

  // Abstract hooks — subclasses provide the data queries

  /** Query direct permission policies assigned to the principal. Return casbin `p` lines. */
  protected abstract buildDirectPolicies(opts: {
    filter: TFilter;
    rolePrincipal: string;
  }): ValueOrPromise<string[]>;

  /** Query role assignments for the principal. Return casbin `g` lines + role IDs. */
  protected abstract buildGroupPolicies(opts: {
    filter: TFilter;
  }): ValueOrPromise<{ lines: string[]; roleIds: (string | number)[] }>;

  /** Query permission policies inherited through roles. Return casbin `p` lines. */
  protected abstract buildRolePolicies(opts: {
    roleIds: (string | number)[];
    rolePrincipal: string;
  }): ValueOrPromise<string[]>;

  // Formatters — shared utilities for subclasses

  /** Format a domain value with optional entity prefix (e.g., `"Organization_<uuid>"`). */
  protected formatDomain(domain: string | null) {
    if (!domain) {
      return null;
    }

    const prefix = this.entities.domain?.principalType;
    return prefix ? `${prefix}_${domain}` : domain;
  }

  /** Format a casbin grouping line: `g, <subject>, <role>[, <domain>]`. */
  protected toGroupLine(opts: { subject: string; role: string; domain: string | null }) {
    const { subject, role, domain } = opts;
    if (domain) {
      return [CasbinRuleVariants.G, subject, role, domain].join(', ');
    }

    return [CasbinRuleVariants.G, subject, role].join(', ');
  }

  /** Format a casbin policy line: `p, <subject>, [<domain>,] <resource>, <action>, <effect>`. */
  protected toPolicyLine(opts: { row: TPolicyRow }) {
    const { row } = opts;
    const { code, action } = row;
    const effect = row.effect ?? 'allow';

    if (!action) {
      return null;
    }

    const subject = `${row.subjectType}_${row.subjectId}`;
    const domain = this.formatDomain(row.domain);

    if (domain) {
      return [CasbinRuleVariants.P, subject, domain, code, action, effect].join(', ');
    }

    return [CasbinRuleVariants.P, subject, code, action, effect].join(', ');
  }
}
