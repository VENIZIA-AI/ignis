import type { TConstValue } from '@venizia/ignis-helpers/common';
import { AuthorizationRole } from '../../models/authorization-role.model';
import { CasbinRuleVariants } from './enforcer';

export class Authorization {
  static readonly RULES = 'authorization.rules';
  static readonly SKIP_AUTHORIZATION = 'authorization.skip';
  static readonly ENFORCER = 'authorization.enforcer';
  static readonly DOMAIN = 'authorization.domain';
}

export class AuthorizationActions {
  static readonly CREATE = 'create';
  static readonly UPDATE = 'update';
  static readonly DELETE = 'delete';
  static readonly EXECUTE = 'execute';

  static readonly READ = 'read';
  static readonly WRITE = 'write';
  static readonly MANAGE = 'manage';

  /** Grant-mode marker for a subset grant carrying `metadata.ops`; never a member of LATTICE. */
  static readonly CUSTOM = 'custom';

  static readonly SCHEME_SET = new Set([
    this.CREATE,
    this.UPDATE,
    this.DELETE,
    this.EXECUTE,

    this.READ,
    this.WRITE,
    this.MANAGE,

    this.CUSTOM,
  ]);

  static readonly LATTICE: ReadonlyArray<{
    child: TAuthorizationAction;
    parent: TAuthorizationAction;
  }> = [
    { child: this.READ, parent: this.MANAGE },
    { child: this.WRITE, parent: this.MANAGE },
    { child: this.EXECUTE, parent: this.MANAGE },
    { child: this.CREATE, parent: this.WRITE },
    { child: this.UPDATE, parent: this.WRITE },
    { child: this.DELETE, parent: this.WRITE },
  ];

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}
export type TAuthorizationAction = TConstValue<typeof AuthorizationActions>;

export class AuthorizationDecisions {
  static readonly ALLOW = 'allow';
  static readonly DENY = 'deny';
  static readonly ABSTAIN = 'abstain';

  static readonly SCHEME_SET = new Set([this.ALLOW, this.DENY, this.ABSTAIN]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }

  static isAllow(input: string | number): boolean {
    if (typeof input === 'number') {
      return input > 0;
    }
    return input.toLowerCase() === this.ALLOW;
  }

  static isDeny(input: string | number): boolean {
    if (typeof input === 'number') {
      return input < 0;
    }
    return input.toLowerCase() === this.DENY;
  }

  static isAbstain(input: string | number): boolean {
    if (typeof input === 'number') {
      return input === 0;
    }
    return input.toLowerCase() === this.ABSTAIN;
  }
}
export type TAuthorizationDecision = TConstValue<typeof AuthorizationDecisions>;

export class AuthorizationRoles {
  static readonly SUPER_ADMIN = AuthorizationRole.build({
    name: 'super-admin',
    priority: 999,
  });
  static readonly ADMIN = AuthorizationRole.build({
    name: 'admin',
    priority: 900,
  });
  static readonly USER = AuthorizationRole.build({
    name: 'user',
    priority: 10,
  });
  static readonly GUEST = AuthorizationRole.build({
    name: 'guest',
    priority: 1,
  });
  static readonly UNKNOWN_USER = AuthorizationRole.build({
    name: 'unknown-user',
    priority: 0,
  });

  static readonly SCHEME_SET = new Set<string>([
    this.SUPER_ADMIN.identifier,
    this.ADMIN.identifier,
    this.USER.identifier,
    this.GUEST.identifier,
    this.UNKNOWN_USER.identifier,
  ]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export class AuthorizationDomainScopes {
  /** Grant applies in EVERY domain the subject is a member of (checked via join_domain / g2). */
  static readonly ANY_MEMBER = 'ANY_MEMBER';

  /** Grant applies system-wide, bypassing membership - super-admin only. */
  static readonly SYSTEM_WIDE = 'SYSTEM_WIDE';

  static readonly SCHEME_SET = new Set([this.ANY_MEMBER, this.SYSTEM_WIDE]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}
export type TAuthorizationDomainScope = TConstValue<typeof AuthorizationDomainScopes>;

/** Edge kinds in the `PolicyDefinition` table (each row: subject -> target, `variant` = kind), carrying `action` (DB `variant` value) + `rule` (casbin prefix emitted per edge). Per-USER edges: GRANT, ASSIGN_ROLE, JOIN_DOMAIN; shared org-structure edges: the *_INHERITS ones. */
export class AuthorizationPolicyVariants {
  /** Give a Permission to a User/Role (row also carries action / effect / domain). casbin `p`: `p, <Role|User>_<id>, <domain>, <permissionCode>, <action>, <allow|deny>` */
  static readonly GRANT = { action: 'grant', rule: CasbinRuleVariants.P } as const;

  /** Give a User a Role (optionally domain-scoped; no domain -> `*` = every domain). casbin `g`: `g, User_<id>, Role_<id>, <domain|*>` */
  static readonly ASSIGN_ROLE = { action: 'assign_role', rule: CasbinRuleVariants.G } as const;

  /** A Role inherits another Role (DAG). Shares `g` with ASSIGN_ROLE so user -> role -> parent-role resolves in one lookup. Emitted with domain `*`: `g, Role_<child>, Role_<parent>, *` */
  static readonly ROLE_INHERITS = { action: 'role_inherits', rule: CasbinRuleVariants.G } as const;

  /** User is a member of a Domain; powers the `ANY_MEMBER` grant scope via `g2(r.sub, r.dom)`. casbin `g2`: `g2, User_<id>, <Type>_<domainId>` */
  static readonly JOIN_DOMAIN = { action: 'join_domain', rule: CasbinRuleVariants.G2 } as const;

  /** DOMAIN axis (`dom`): domain nesting. Matcher: `g3(r.dom, p.dom)` + self-link so an exact domain always matches itself. casbin `g3`: `g3, <Type>_<childId>, <Type>_<parentId>` */
  static readonly DOMAIN_INHERITS = {
    action: 'domain_inherits',
    rule: CasbinRuleVariants.G3,
  } as const;

  /** RESOURCE axis (`obj`), NON-standard nesting only - dotted nesting (`Order.findById ⊂ Order`) is handled by `objectMatch` WITHOUT an edge. Matcher: `objectMatch(r.obj, p.obj) || g4(r.obj, p.obj)`, casbin `g4`: `g4, <childCode>, <parentCode>` */
  static readonly RESOURCE_INHERITS = {
    action: 'resource_inherits',
    rule: CasbinRuleVariants.G4,
  } as const;

  /** ACTION axis (`act`): a narrow action covered by a broader one; no dotted shortcut, so it needs an explicit edge. Matcher: `g5(r.act, p.act)`, casbin `g5`: `g5, <childAction>, <parentAction>`. g4 + g5 combine multiplicatively: `manage Order` covers a `read OrderItem` request. */
  static readonly ACTION_INHERITS = {
    action: 'action_inherits',
    rule: CasbinRuleVariants.G5,
  } as const;

  /** Every edge kind, in declaration order - the one place the scheme sets and the `variant` column's literal type both derive from. */
  static readonly ALL = [
    this.GRANT,
    this.ASSIGN_ROLE,
    this.ROLE_INHERITS,
    this.JOIN_DOMAIN,
    this.DOMAIN_INHERITS,
    this.RESOURCE_INHERITS,
    this.ACTION_INHERITS,
  ] as const;

  static readonly ACTION_SCHEME_SET = new Set(this.ALL.map(variant => variant.action.toString()));

  static readonly RULE_SCHEME_SET = new Set(this.ALL.map(variant => variant.rule.toString()));

  static isValidAction(input: string): boolean {
    return this.ACTION_SCHEME_SET.has(input);
  }

  static isValidRule(input: string): boolean {
    return this.RULE_SCHEME_SET.has(input);
  }
}

/** The `variant` column's full value set, derived from {@link AuthorizationPolicyVariants.ALL} - never hand-list the seven strings again. */
export type TAuthorizationPolicyVariant =
  (typeof AuthorizationPolicyVariants.ALL)[number]['action'];
