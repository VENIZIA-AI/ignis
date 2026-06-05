import { IdType } from '@/base';
import { TNullable } from '@/helpers';
import {
  AuthorizationActions,
  AuthorizationPolicyVariants,
  TAuthorizationAction,
  TAuthorizationDecision,
} from './constants';

/** A grant/assignment domain: a scope literal (`SYSTEM_WIDE`/`ANY_MEMBER`) or a typed domain entity. */
export type TPolicyDomainInput = string | { type: string; id: IdType };

export class AuthorizationPolicyBuilder {
  static readonly ACTION_PRINCIPAL = 'Action';

  /**
   * Serialize a domain to the casbin token the matcher compares against {@link resolveRequestDomain}'s
   * output: a scope literal (`SYSTEM_WIDE`/`ANY_MEMBER`) passes through unchanged; a typed domain becomes
   * `<type>_<id>` so `g3(r.dom, p.dom)` cascades; null ⇒ null (the adapter then defaults grants to `ANY_MEMBER`).
   */
  private static serializeDomain(domain?: TNullable<TPolicyDomainInput>): TNullable<string> {
    if (domain == null) {
      return null;
    }

    if (typeof domain === 'string') {
      return domain;
    }

    return [domain.type, domain.id].join('_');
  }

  /**
   * A grant (casbin `p`): role/user → permission, carrying action + effect + domain.
   * `domain` null ⇒ `ANY_MEMBER` (adapter default). Pass a scope literal or a typed `{ type, id }` domain.
   */
  static grant(opts: {
    subject: { type: string; id: IdType };
    permission: { type: string; id: IdType };
    action: string;
    domain?: TNullable<TPolicyDomainInput>;
    effect: TAuthorizationDecision;
  }) {
    return {
      variant: AuthorizationPolicyVariants.GRANT.action,
      subjectType: opts.subject.type,
      subjectId: opts.subject.id,
      targetType: opts.permission.type,
      targetId: opts.permission.id,
      action: opts.action,
      effect: opts.effect,
      domain: AuthorizationPolicyBuilder.serializeDomain(opts.domain),
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
      domain: AuthorizationPolicyBuilder.serializeDomain(opts.domain),
    };
  }

  /** A user joins a domain (casbin `g2`) — backs the `ANY_MEMBER` grant scope. */
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

  /**
   * A resource inherits another (casbin `g4`): a grant on the PARENT covers the CHILD.
   * e.g. `{ child: SaleOrder, parent: Sale }` — grant on module `Sale` covers subject `SaleOrder`.
   * Many-to-many: a subject may inherit several module parents (add one edge each).
   */
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

  /**
   * Build a role's coarse grant rows from resolved permission ids. The caller resolves each
   * `resourceCode` (subject/module) to a `Permission` and supplies the lookup; unresolved codes are skipped.
   */
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
