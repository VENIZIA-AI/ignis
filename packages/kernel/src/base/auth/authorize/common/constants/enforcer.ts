import type { TConstValue } from '@venizia/ignis-helpers/common';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** Kinds of enforcer a registration can declare; `casbin` takes `ICasbinEnforcerOptions`, `custom` takes untyped options. */
export class AuthorizationEnforcerTypes extends ConstClass {
  static readonly CASBIN = 'casbin';
  static readonly CUSTOM = 'custom';
}

/** Union of the `AuthorizationEnforcerTypes` values. */
export type TAuthorizationEnforcerType = TConstValue<typeof AuthorizationEnforcerTypes>;

/** Cache backends for a Casbin enforcer's per-user policy lines. */
export class CasbinEnforcerCachedDrivers extends ConstClass {
  static readonly REDIS = 'redis';
}

/** Union of the `CasbinEnforcerCachedDrivers` values. */
export type TCasbinEnforcerCachedDriver = TConstValue<typeof CasbinEnforcerCachedDrivers>;

/** Where a Casbin enforcer reads its model from: a `file` path or inline `text`. */
export class CasbinEnforcerModelDrivers extends ConstClass {
  static readonly FILE = 'file';
  static readonly TEXT = 'text';
}

/** Union of the `CasbinEnforcerModelDrivers` values. */
export type TCasbinEnforcerModelDriver = TConstValue<typeof CasbinEnforcerModelDrivers>;

/** Casbin matching functions selectable for the domain match in `ICasbinEnforcerOptions.domainMatching`. */
export class CasbinDomainMatchingFunctions extends ConstClass {
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
}

/** Union of the `CasbinDomainMatchingFunctions` values. */
export type TCasbinDomainMatchingFunction = TConstValue<typeof CasbinDomainMatchingFunctions>;

/** Relation prefixes the Casbin MODEL declares (`p` + `g`..`g5`), which {@link AuthorizationPolicyVariants} maps onto (many app edge-types -> one rule). Keep in sync with the model's `[role_definition]`. */
export class CasbinRuleVariants {
  /** Permission policy line. */
  static readonly P = 'p';

  /** Numbered in request-tuple order (sub -> dom -> obj -> act): g (sub), g2/g3 (dom), g4 (obj), g5 (act). */

  /** Grouping #1 - role membership + role inheritance (user→role, role→role). The `sub` axis. */
  static readonly G = 'g';

  /** Grouping #2 - user→domain membership (join_domain). The `dom` axis (membership). */
  static readonly G2 = 'g2';

  /** Grouping #3 - domain hierarchy. The `dom` axis (nesting). */
  static readonly G3 = 'g3';

  /** Grouping #4 - resource hierarchy. The `obj` axis. */
  static readonly G4 = 'g4';

  /** Grouping #5 - action hierarchy. The `act` axis. */
  static readonly G5 = 'g5';
}

/** Union of the `CasbinRuleVariants` values. */
export type TCasbinRuleVariant = TConstValue<typeof CasbinRuleVariants>;
