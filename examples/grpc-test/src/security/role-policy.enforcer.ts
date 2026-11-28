import { Permissions, Roles } from '@/common/roles';
import { z } from '@hono/zod-openapi';
import {
  AuthorizationDecisions,
  type IAuthorizationEnforcer,
  type IAuthorizationRequest,
  type IAuthorizationUser,
  type TAuthorizationDecision,
  type TContext,
} from '@venizia/ignis';
import { BaseHelper } from '@venizia/ignis-helpers';
import type { Env } from 'hono';

const RolesClaimSchema = z.array(z.object({ identifier: z.string() }));

type TPermission = { resource: string; action: string };

/** What each role may do. Anything not listed here is denied. */
const POLICY = new Map<string, TPermission[]>([
  [Roles.VIEWER, [Permissions.NOTE_READ]],
  [Roles.EDITOR, [Permissions.NOTE_READ, Permissions.NOTE_CREATE]],
]);

/**
 * A role policy kept in code: the roles of the token name the permissions. For policies stored in a database, with
 * tenants or inheritance, use `CasbinAuthorizationEnforcer` instead.
 */
export class RolePolicyEnforcer
  extends BaseHelper
  implements IAuthorizationEnforcer<Env, string, string, TPermission[]>
{
  name = RolePolicyEnforcer.name;

  constructor() {
    super({ scope: RolePolicyEnforcer.name });
  }

  configure() {}

  buildRules(opts: { user: IAuthorizationUser }): TPermission[] {
    const roles = RolesClaimSchema.safeParse(opts.user.roles);

    if (!roles.success) {
      return [];
    }

    return roles.data.flatMap((role) => POLICY.get(role.identifier) ?? []);
  }

  evaluate(opts: {
    rules: TPermission[];
    request: IAuthorizationRequest<string, string>;
    context: TContext<Env, string>;
  }): TAuthorizationDecision {
    const { rules, request } = opts;
    const isGranted = rules.some(
      (rule) => rule.resource === request.resource && rule.action === request.action,
    );

    return isGranted ? AuthorizationDecisions.ALLOW : AuthorizationDecisions.DENY;
  }
}
