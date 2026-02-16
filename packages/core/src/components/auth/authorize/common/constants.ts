import { TConstValue } from '@venizia/ignis-helpers';
import { AuthorizationRole } from '../models/authorization-role.model';

// --------------------------------------------------------------------------------------------------------
export class Authorization {
  static readonly ABILITIES = 'authorization.abilities';
  static readonly SKIP_AUTHORIZATION = 'authorization.skip';
  static readonly AUTHORIZATION_ENFORCER = 'authorization.enforcer';
}

// --------------------------------------------------------------------------------------------------------
export class AuthorizationActions {
  static readonly CREATE = 'create';
  static readonly READ = 'read';
  static readonly UPDATE = 'update';
  static readonly DELETE = 'delete';
  static readonly EXECUTE = 'execute';
  static readonly MANAGE = 'manage';

  static readonly SCHEME_SET = new Set([
    this.CREATE,
    this.READ,
    this.UPDATE,
    this.DELETE,
    this.EXECUTE,
    this.MANAGE,
  ]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}
export type TAuthorizationAction = TConstValue<typeof AuthorizationActions>;

// --------------------------------------------------------------------------------------------------------
export class AuthorizationDecisions {
  static readonly ALLOW = 'allow';
  static readonly DENY = 'deny';
  static readonly ABSTAIN = 'abstain';

  static readonly SCHEME_SET = new Set([this.ALLOW, this.DENY, this.ABSTAIN]);

  static isValid(input: string): boolean {
    return this.SCHEME_SET.has(input);
  }
}
export type TAuthorizationDecision = TConstValue<typeof AuthorizationDecisions>;
export type TPermissionEffect =
  | typeof AuthorizationDecisions.ALLOW
  | typeof AuthorizationDecisions.DENY;

// --------------------------------------------------------------------------------------------------------
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
