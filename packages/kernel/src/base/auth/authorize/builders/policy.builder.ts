import type { IdType } from '@/base';
import type { TNullable } from '@venizia/ignis-helpers/common';
import type { TAuthorizationAction, TAuthorizationDecision } from '../common/constants';
import {
  AuthorizationActions,
  AuthorizationDomainScopes,
  AuthorizationPolicyVariants,
} from '../common/constants';

/** A grant/assignment domain: a scope literal (`SYSTEM_WIDE`/`ANY_MEMBER`) or a typed domain entity. */
export type TPolicyDomainInput = string | { type: string; id: IdType };

/**
 * Explicit on purpose: `TAuthorizationDecision` is `Extract<ValueOf<T>, string | number>`, and its
 * literal members widen to `string` when a method's return type is inferred rather than declared.
 * Without this annotation `grant()`'s `effect` stops satisfying `PolicyDefinition`'s narrowed column.
 * Not exported - `TGrantRow`/`TCustomGrantRow` already name unrelated adapter-side row shapes
 * downstream; consumers derive this shape via `ReturnType<typeof AuthorizationPolicyBuilder.grant>`.
 */
type TBuilderGrantRow = {
  variant: typeof AuthorizationPolicyVariants.GRANT.action;
  subjectType: string;
  subjectId: IdType;
  targetType: string;
  targetId: IdType;
  action: string;
  effect: TAuthorizationDecision;
  domainType: TNullable<string>;
  domainId: TNullable<IdType>;
};

/**
 * What IGNIS itself stores in `PolicyDefinition.metadata`: the operations of a subset grant, read
 * back by `ScopedCasbinAdapter` through `parseCustomGrantMetadata`. An application whose own
 * metadata has a different shape points the adapter at a different column
 * (`entities.policyDefinition.metadata.columnName`) rather than widening this one.
 *
 * Declared here, beside the only writer, so the column type and the row type cannot drift.
 */
export type TSubsetGrantMetadata = { ops: string[] };

type TBuilderCustomGrantRow = Omit<TBuilderGrantRow, 'action'> & {
  action: typeof AuthorizationActions.CUSTOM;
  metadata: TSubsetGrantMetadata;
};

export class AuthorizationPolicyBuilder {
  static readonly ACTION_PRINCIPAL = 'Action';

  /** A domain as the two columns that store it. `ANY_MEMBER` normalises to null - admitting both spellings would leave one state reachable two ways. */
  private static splitDomain(domain?: TNullable<TPolicyDomainInput>): {
    domainType: TNullable<string>;
    domainId: TNullable<IdType>;
  } {
    if (domain == null || domain === AuthorizationDomainScopes.ANY_MEMBER) {
      return { domainType: null, domainId: null };
    }

    if (typeof domain === 'string') {
      return { domainType: domain, domainId: null };
    }

    return { domainType: domain.type, domainId: domain.id };
  }

  /** A grant (casbin `p`): role/user -> permission, carrying action + effect + domain. A null `domain` means `ANY_MEMBER` (adapter default); pass a scope literal or a typed `{ type, id }` domain. */
  static grant(opts: {
    subject: { type: string; id: IdType };
    permission: { type: string; id: IdType };
    action: string;
    domain?: TNullable<TPolicyDomainInput>;
    effect: TAuthorizationDecision;
  }): TBuilderGrantRow {
    return {
      variant: AuthorizationPolicyVariants.GRANT.action,
      subjectType: opts.subject.type,
      subjectId: opts.subject.id,
      targetType: opts.permission.type,
      targetId: opts.permission.id,
      action: opts.action,
      effect: opts.effect,
      ...AuthorizationPolicyBuilder.splitDomain(opts.domain),
    };
  }

  /** A subset grant (casbin `p` x N): role/user -> resource node with the granted operations in metadata. `action` is fixed to the CUSTOM sentinel; the adapter expands `ops` at read time. */
  static customGrant(opts: {
    subject: { type: string; id: IdType };
    permission: { type: string; id: IdType };
    ops: string[];
    domain?: TNullable<TPolicyDomainInput>;
    effect: TAuthorizationDecision;
  }): TBuilderCustomGrantRow {
    return {
      variant: AuthorizationPolicyVariants.GRANT.action,
      subjectType: opts.subject.type,
      subjectId: opts.subject.id,
      targetType: opts.permission.type,
      targetId: opts.permission.id,
      action: AuthorizationActions.CUSTOM,
      effect: opts.effect,
      ...AuthorizationPolicyBuilder.splitDomain(opts.domain),
      metadata: { ops: opts.ops },
    };
  }

  /** Assign a role to a user (casbin `g`). `domain` null ⇒ `*` (every domain). */
  static assignRole(opts: {
    user: { type: string; id: IdType };
    role: { type: string; id: IdType };
    domain?: TNullable<TPolicyDomainInput>;
  }) {
    return {
      variant: AuthorizationPolicyVariants.ASSIGN_ROLE.action,
      subjectType: opts.user.type,
      subjectId: opts.user.id,
      targetType: opts.role.type,
      targetId: opts.role.id,
      ...AuthorizationPolicyBuilder.splitDomain(opts.domain),
    };
  }

  /** A user joins a domain (casbin `g2`) - backs the `ANY_MEMBER` grant scope. */
  static joinDomain(opts: {
    user: { type: string; id: IdType };
    domain: { type: string; id: IdType };
  }) {
    return {
      variant: AuthorizationPolicyVariants.JOIN_DOMAIN.action,
      subjectType: opts.user.type,
      subjectId: opts.user.id,
      targetType: opts.domain.type,
      targetId: opts.domain.id,
    };
  }

  /** A role inherits another role (casbin `g`, shared relation with assign_role). */
  static roleInherits(opts: {
    child: { type: string; id: IdType };
    parent: { type: string; id: IdType };
  }) {
    return {
      variant: AuthorizationPolicyVariants.ROLE_INHERITS.action,
      subjectType: opts.child.type,
      subjectId: opts.child.id,
      targetType: opts.parent.type,
      targetId: opts.parent.id,
    };
  }

  /** A resource inherits another (casbin `g4`): a grant on the PARENT covers the CHILD. Many-to-many - a subject may inherit several module parents, one edge each. */
  static resourceInherits(opts: {
    child: { type: string; id: IdType }; // Permission
    parent: { type: string; id: IdType }; // Permission
  }) {
    return {
      variant: AuthorizationPolicyVariants.RESOURCE_INHERITS.action,
      subjectType: opts.child.type,
      subjectId: opts.child.id,
      targetType: opts.parent.type,
      targetId: opts.parent.id,
    };
  }

  /** An action inherits another (casbin `g5`): the child action is implied by the parent, e.g. read ⊂ manage. */
  static actionInherits(opts: { child: TAuthorizationAction; parent: TAuthorizationAction }) {
    return {
      variant: AuthorizationPolicyVariants.ACTION_INHERITS.action,
      subjectType: this.ACTION_PRINCIPAL,
      subjectId: opts.child,
      targetType: this.ACTION_PRINCIPAL,
      targetId: opts.parent,
    };
  }

  /** All `action_inherits` rows for the standard {@link AuthorizationActions.LATTICE}. Seed once, idempotently. */
  static actionLattice() {
    return AuthorizationActions.LATTICE.map(action => this.actionInherits(action));
  }

  /** A domain inherits another (casbin `g3`): a grant in the parent domain cascades to the child. e.g. Merchant ⊂ Organizer. */
  static domainInherits(opts: {
    child: { type: string; id: IdType };
    parent: { type: string; id: IdType };
  }) {
    return {
      variant: AuthorizationPolicyVariants.DOMAIN_INHERITS.action,
      subjectType: opts.child.type,
      subjectId: opts.child.id,
      targetType: opts.parent.type,
      targetId: opts.parent.id,
    };
  }

  /** Build a role's coarse grant rows from resolved permission ids. The caller resolves each `resourceCode` (subject/module) to a `Permission` and supplies the lookup; unresolved codes are skipped. */
  static roleGrants(opts: {
    role: { type: string; id: IdType };
    permission: {
      type: string;
      idByCode: ReadonlyMap<string, string>;
    };

    grants: ReadonlyArray<{
      resourceCode: string;
      action: string;
      domain?: TNullable<TPolicyDomainInput>;
      effect: TAuthorizationDecision;
    }>;
  }) {
    const rows: Array<ReturnType<typeof AuthorizationPolicyBuilder.grant>> = [];

    for (const grant of opts.grants) {
      const permissionId = opts.permission.idByCode.get(grant.resourceCode);
      if (!permissionId) {
        continue;
      }

      const policy = AuthorizationPolicyBuilder.grant({
        subject: { type: opts.role.type, id: opts.role.id },
        permission: { type: opts.permission.type, id: permissionId },
        action: grant.action,
        domain: grant.domain,
        effect: grant.effect,
      });

      rows.push(policy);
    }

    return rows;
  }
}
