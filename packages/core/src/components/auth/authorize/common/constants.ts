import { TConstValue } from '@venizia/ignis-helpers';
import { AuthorizationRole } from '../models/authorization-role.model';

export class Authorization {
  static readonly RULES = 'authorization.rules';
  static readonly SKIP_AUTHORIZATION = 'authorization.skip';
  static readonly ENFORCER = 'authorization.enforcer';
  static readonly DOMAIN = 'authorization.domain';
}

export class AuthorizationActions {
  static readonly CREATE = 'create';
  static readonly READ = 'read';
  static readonly UPDATE = 'update';
  static readonly DELETE = 'delete';
  static readonly EXECUTE = 'execute';

  static readonly SCHEME_SET = new Set([
    this.CREATE,
    this.READ,
    this.UPDATE,
    this.DELETE,
    this.EXECUTE,
  ]);

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

export class AuthorizationEnforcerTypes {
  static readonly CASBIN = 'casbin';
  static readonly CUSTOM = 'custom';

  static readonly SCHEME_SET = new Set([this.CASBIN, this.CUSTOM]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TAuthorizationEnforcerType = TConstValue<typeof AuthorizationEnforcerTypes>;

export class CasbinEnforcerCachedDrivers {
  static readonly REDIS = 'redis';

  static readonly SCHEME_SET = new Set([this.REDIS]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TCasbinEnforcerCachedDriver = TConstValue<typeof CasbinEnforcerCachedDrivers>;

export class CasbinEnforcerModelDrivers {
  static readonly FILE = 'file';
  static readonly TEXT = 'text';

  static readonly SCHEME_SET = new Set([this.FILE, this.TEXT]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TCasbinEnforcerModelDriver = TConstValue<typeof CasbinEnforcerModelDrivers>;

export class CasbinDomainMatchingFunctions {
  /** `*` is the only wildcard; exact compare otherwise. Safest for `Merchant_<uuid>` domains. */
  static readonly KEY_MATCH = 'keyMatch';

  /** Adds URL-path `:param` segment matching. */
  static readonly KEY_MATCH_2 = 'keyMatch2';

  /** Adds `{param}` segment matching. */
  static readonly KEY_MATCH_3 = 'keyMatch3';

  /** `{param}` matching with repeated-name equality checks. */
  static readonly KEY_MATCH_4 = 'keyMatch4';

  /** Treats the stored/policy value as a full regular expression. */
  static readonly REGEX_MATCH = 'regexMatch';

  static readonly SCHEME_SET = new Set([
    this.KEY_MATCH,
    this.KEY_MATCH_2,
    this.KEY_MATCH_3,
    this.KEY_MATCH_4,
    this.REGEX_MATCH,
  ]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TCasbinDomainMatchingFunction = TConstValue<typeof CasbinDomainMatchingFunctions>;

export class AuthorizationDomainScopes {
  /** Grant applies in EVERY domain the subject is a member of (checked via join_domain / g2). */
  static readonly ANY_MEMBER = 'ANY_MEMBER';

  /** Grant applies system-wide, bypassing membership — super-admin only. */
  static readonly SYSTEM_WIDE = 'SYSTEM_WIDE';

  static readonly SCHEME_SET = new Set([this.ANY_MEMBER, this.SYSTEM_WIDE]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}
export type TAuthorizationDomainScope = TConstValue<typeof AuthorizationDomainScopes>;

/**
 * Engine-level vocabulary: the relation prefixes the Casbin MODEL declares — `p` for permission
 * policies and `g`/`g2`…`g5` for grouping relations. This is the low-level building block that
 * {@link AuthorizationPolicyVariants} maps onto (many app edge-types → one rule, e.g. both
 * `assign_role` and `role_inherits` use `g`). Keep these in sync with the model's `[role_definition]`.
 */
export class CasbinRuleVariants {
  /** Permission policy line. */
  static readonly P = 'p';

  /**
   * Numbered in request-tuple order (`sub → dom → obj → act`) so the matcher reads left-to-right:
   * g (sub), g2/g3 (dom), g4 (obj), g5 (act).
   */

  /** Grouping #1 — role membership + role inheritance (user→role, role→role). The `sub` axis. */
  static readonly G = 'g';

  /** Grouping #2 — user→domain membership (join_domain). The `dom` axis (membership). */
  static readonly G2 = 'g2';

  /** Grouping #3 — domain hierarchy. The `dom` axis (nesting). */
  static readonly G3 = 'g3';

  /** Grouping #4 — resource hierarchy. The `obj` axis. */
  static readonly G4 = 'g4';

  /** Grouping #5 — action hierarchy. The `act` axis. */
  static readonly G5 = 'g5';
}

export type TCasbinRuleVariant = TConstValue<typeof CasbinRuleVariants>;

/**
 * The kinds of "edge" stored in the single `PolicyDefinition` table. Every row links a `subject`
 * (type + id) to a `target` (type + id); the `variant` column says WHAT kind of link it is.
 *
 * Picture the whole RBAC state as a graph — nodes are User / Role / Permission / Domain, and each
 * PolicyDefinition row is one edge. `ScopedCasbinAdapter` reads these rows and emits one casbin line
 * per edge. Each entry below carries:
 *   - `action` — the value stored in the DB `variant` column (what the adapter filters on).
 *   - `rule`   — the casbin grouping/policy prefix the adapter emits for that edge (`p`, `g`, `g2`…).
 *
 * Per-USER edges (differ per user): GRANT, ASSIGN_ROLE, JOIN_DOMAIN.
 * Shared HIERARCHY edges (same for everyone — describe the org structure, not a user):
 *   ROLE_INHERITS, RESOURCE_INHERITS, ACTION_INHERITS, DOMAIN_INHERITS.
 */
export class AuthorizationPolicyVariants {
  /**
   * Give a Permission to a User or Role (the grant row also carries action / effect / domain).
   * casbin `p`: `p, <Role|User>_<id>, <domain>, <permissionCode>, <action>, <allow|deny>`
   * e.g. `p, Role_5, ANY_MEMBER, Order, read, allow` — "Role 5 may read Order in any joined domain".
   */
  static readonly GRANT = { action: 'grant', rule: CasbinRuleVariants.P } as const;

  /**
   * Give a User a Role (optionally scoped to a domain; no domain → `*` = every domain).
   * casbin `g`: `g, User_<id>, Role_<id>, <domain|*>`
   * e.g. `g, User_42, Role_5, *` — "User 42 holds Role 5 everywhere".
   */
  static readonly ASSIGN_ROLE = { action: 'assign_role', rule: CasbinRuleVariants.G } as const;

  /**
   * A Role inherits another Role (DAG). Shares the `g` relation with ASSIGN_ROLE so a
   * user → role → parent-role chain resolves in one lookup. Emitted with domain `*`.
   * casbin `g`: `g, Role_<child>, Role_<parent>, *`
   * e.g. `g, Role_5, Role_9, *` — "Role 5 inherits everything Role 9 has".
   */
  static readonly ROLE_INHERITS = { action: 'role_inherits', rule: CasbinRuleVariants.G } as const;

  /**
   * A User is a member of a Domain. Powers the `ANY_MEMBER` grant scope — a grant with domain
   * `ANY_MEMBER` applies in every domain the user joined. Matcher uses `g2(r.sub, r.dom)`.
   * casbin `g2`: `g2, User_<id>, <Type>_<domainId>`
   * e.g. `g2, User_42, Merchant_7` — "User 42 is a member of Merchant 7".
   */
  static readonly JOIN_DOMAIN = { action: 'join_domain', rule: CasbinRuleVariants.G2 } as const;

  /**
   * DOMAIN axis (the `dom` of a request). One domain is nested under a parent domain.
   * Matcher: `g3(r.dom, p.dom)` (+ self-link, so an exact domain always matches itself).
   * casbin `g3`: `g3, <Type>_<childId>, <Type>_<parentId>`
   * e.g. `g3, Branch_1, Company_9` — "a grant scoped to Company 9 also applies in Branch 1".
   */
  static readonly DOMAIN_INHERITS = {
    action: 'domain_inherits',
    rule: CasbinRuleVariants.G3,
  } as const;

  /**
   * RESOURCE axis (the `obj` of a request). One resource is nested under a broader one — for
   * NON-standard nesting only; dotted nesting (`Order.findById ⊂ Order`) is handled by `objectMatch`
   * WITHOUT an edge. Matcher: `objectMatch(r.obj, p.obj) || g4(r.obj, p.obj)`.
   * casbin `g4`: `g4, <childCode>, <parentCode>`
   * e.g. `g4, OrderItem, Order` — "a grant on Order also covers OrderItem".
   */
  static readonly RESOURCE_INHERITS = {
    action: 'resource_inherits',
    rule: CasbinRuleVariants.G4,
  } as const;

  /**
   * ACTION axis (the `act` of a request) — SAME shape as RESOURCE_INHERITS but a DIFFERENT axis: a
   * narrow action is covered by a broader one. No dotted shortcut — needs an explicit edge.
   * Matcher: `g5(r.act, p.act)`.
   * casbin `g5`: `g5, <childAction>, <parentAction>`
   * e.g. `g5, read, manage` — "a grant of manage also allows read".
   * (g4 + g5 combine multiplicatively: a `manage Order` grant covers a `read OrderItem` request.)
   */
  static readonly ACTION_INHERITS = {
    action: 'action_inherits',
    rule: CasbinRuleVariants.G5,
  } as const;

  static readonly ACTION_SCHEME_SET = new Set([
    this.GRANT.action.toString(),
    this.ASSIGN_ROLE.action.toString(),
    this.ROLE_INHERITS.action.toString(),
    this.JOIN_DOMAIN.action.toString(),
    this.DOMAIN_INHERITS.action.toString(),
    this.RESOURCE_INHERITS.action.toString(),
    this.ACTION_INHERITS.action.toString(),
  ]);

  static readonly RULE_SCHEME_SET = new Set([
    this.GRANT.rule.toString(),
    this.ASSIGN_ROLE.rule.toString(),
    this.ROLE_INHERITS.rule.toString(),
    this.JOIN_DOMAIN.rule.toString(),
    this.DOMAIN_INHERITS.rule.toString(),
    this.RESOURCE_INHERITS.rule.toString(),
    this.ACTION_INHERITS.rule.toString(),
  ]);

  static isValidAction(input: string): boolean {
    return this.ACTION_SCHEME_SET.has(input);
  }

  static isValidRule(input: string): boolean {
    return this.RULE_SCHEME_SET.has(input);
  }
}
export type TAuthorizationPolicyVariant = TConstValue<typeof AuthorizationPolicyVariants>;
