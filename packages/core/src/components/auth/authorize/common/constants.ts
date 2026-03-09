import { TConstValue } from '@venizia/ignis-helpers';
import { AuthorizationRole } from '../models/authorization-role.model';

export class Authorization {
  static readonly RULES = 'authorization.rules';
  static readonly SKIP_AUTHORIZATION = 'authorization.skip';
  static readonly ENFORCER = 'authorization.enforcer';
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
  static readonly IN_MEMORY = 'in-memory';
  static readonly REDIS = 'redis';

  static readonly SCHEME_SET = new Set([this.IN_MEMORY, this.REDIS]);

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

export class CasbinRuleVariants {
  static readonly POLICY = 'policy';
  static readonly GROUP = 'group';

  /** Casbin line prefix for policy rules. */
  static readonly P = 'p';
  /** Casbin line prefix for grouping rules. */
  static readonly G = 'g';

  static readonly SCHEME_SET = new Set([this.POLICY, this.GROUP]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}

export type TCasbinRuleVariant = TConstValue<typeof CasbinRuleVariants>;
