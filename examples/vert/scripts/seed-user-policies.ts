/**
 * Seeds PolicyDefinition rows for a specific test user.
 * Queries the User table to resolve userId from username,
 * then inserts role-assignment and permission-grant rows via AuthorizationPolicyBuilder.
 *
 * Run from examples/vert: NODE_ENV=development bun run scripts/seed-user-policies.ts <username>
 */
import 'dotenv-flow/config';

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import type { IdType } from '@venizia/ignis';
import {
  AuthorizationActions,
  AuthorizationDecisions,
  AuthorizationPolicyBuilder,
} from '@venizia/ignis';

const pool = new Pool({
  host: process.env.APP_ENV_POSTGRES_HOST ?? '0.0.0.0',
  port: parseInt(process.env.APP_ENV_POSTGRES_PORT ?? '5432'),
  database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'db',
  user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
  password: process.env.APP_ENV_POSTGRES_PASSWORD ?? 'password',
});

const username = process.argv[2];
if (!username) {
  console.error('Usage: bun run scripts/seed-user-policies.ts <username>');
  process.exit(1);
}

interface SeedIds {
  organizations: { orgAlpha: string; orgBeta: string };
  roles: { superAdmin: string; admin: string; user: string; guest: string };
  permissions: { readConfig: string; createUser: string; readDashboard: string };
}

/** Principal type labels stored in PolicyDefinition.subjectType/targetType. Must match the entity `.name` values application.ts registers as `principals`/`domainTypes` - drifting here is invisible to the adapter, not a type error. */
class PolicyPrincipalTypes {
  static readonly USER = 'user';
  static readonly ROLE = 'Role';
  static readonly PERMISSION = 'Permission';
  static readonly ORGANIZATION = 'Organization';
}

interface PolicyRow {
  variant: string;
  subjectType: string;
  subjectId: string;
  targetType: string;
  targetId: string;
  action: string | null;
  effect: string | null;
  domain: string | null;
}

/** Normalize an AuthorizationPolicyBuilder result (action/effect/domain are absent on non-grant edges) into an insertable row. */
function toRow(policy: {
  variant: string;
  subjectType: string;
  subjectId: IdType;
  targetType: string;
  targetId: IdType;
  action?: string | null;
  effect?: string | null;
  domain?: string | null;
}): PolicyRow {
  return {
    variant: policy.variant,
    subjectType: policy.subjectType,
    subjectId: String(policy.subjectId),
    targetType: policy.targetType,
    targetId: String(policy.targetId),
    action: policy.action ?? null,
    effect: policy.effect ?? null,
    domain: policy.domain ?? null,
  };
}

function buildPolicies(opts: { userId: string; ids: SeedIds }): PolicyRow[] {
  const { userId, ids } = opts;
  const { organizations: orgs, roles, permissions: perms } = ids;

  const orgAlphaDomain = { type: PolicyPrincipalTypes.ORGANIZATION, id: orgs.orgAlpha };
  const orgBetaDomain = { type: PolicyPrincipalTypes.ORGANIZATION, id: orgs.orgBeta };

  const policyMap: Record<string, PolicyRow[]> = {
    // Super admin — alwaysAllowRoles bypass
    test_superadmin: [
      toRow(
        AuthorizationPolicyBuilder.assignRole({
          user: { type: PolicyPrincipalTypes.USER, id: userId },
          role: { type: PolicyPrincipalTypes.ROLE, id: roles.superAdmin },
          domain: orgAlphaDomain,
        }),
      ),
    ],

    // Admin — has create:user via role policy in org_alpha
    test_admin: [
      toRow(
        AuthorizationPolicyBuilder.assignRole({
          user: { type: PolicyPrincipalTypes.USER, id: userId },
          role: { type: PolicyPrincipalTypes.ROLE, id: roles.admin },
          domain: orgAlphaDomain,
        }),
      ),
      toRow(
        AuthorizationPolicyBuilder.grant({
          subject: { type: PolicyPrincipalTypes.ROLE, id: roles.admin },
          permission: { type: PolicyPrincipalTypes.PERMISSION, id: perms.createUser },
          action: AuthorizationActions.CREATE,
          effect: AuthorizationDecisions.ALLOW,
          domain: orgAlphaDomain,
        }),
      ),
    ],

    // Regular user — has read:configuration via role policy in org_alpha
    test_user: [
      toRow(
        AuthorizationPolicyBuilder.assignRole({
          user: { type: PolicyPrincipalTypes.USER, id: userId },
          role: { type: PolicyPrincipalTypes.ROLE, id: roles.user },
          domain: orgAlphaDomain,
        }),
      ),
      toRow(
        AuthorizationPolicyBuilder.grant({
          subject: { type: PolicyPrincipalTypes.ROLE, id: roles.user },
          permission: { type: PolicyPrincipalTypes.PERMISSION, id: perms.readConfig },
          action: AuthorizationActions.READ,
          effect: AuthorizationDecisions.ALLOW,
          domain: orgAlphaDomain,
        }),
      ),
    ],

    // Guest — role assigned but no permission policies
    test_guest: [
      toRow(
        AuthorizationPolicyBuilder.assignRole({
          user: { type: PolicyPrincipalTypes.USER, id: userId },
          role: { type: PolicyPrincipalTypes.ROLE, id: roles.guest },
          domain: orgAlphaDomain,
        }),
      ),
    ],

    // Beta admin — has read:configuration in org_beta (different tenant)
    test_beta_admin: [
      toRow(
        AuthorizationPolicyBuilder.assignRole({
          user: { type: PolicyPrincipalTypes.USER, id: userId },
          role: { type: PolicyPrincipalTypes.ROLE, id: roles.admin },
          domain: orgBetaDomain,
        }),
      ),
      toRow(
        AuthorizationPolicyBuilder.grant({
          subject: { type: PolicyPrincipalTypes.ROLE, id: roles.admin },
          permission: { type: PolicyPrincipalTypes.PERMISSION, id: perms.readConfig },
          action: AuthorizationActions.READ,
          effect: AuthorizationDecisions.ALLOW,
          domain: orgBetaDomain,
        }),
      ),
    ],

    // No-org user — role assigned with no domain, so the g-line is "*" (every domain). Still 403:
    // there is no org-scoped grant for it to match against.
    test_no_org: [
      toRow(
        AuthorizationPolicyBuilder.assignRole({
          user: { type: PolicyPrincipalTypes.USER, id: userId },
          role: { type: PolicyPrincipalTypes.ROLE, id: roles.user },
        }),
      ),
    ],

    // Denied user — has allow via role + explicit deny at user level
    test_denied: [
      toRow(
        AuthorizationPolicyBuilder.assignRole({
          user: { type: PolicyPrincipalTypes.USER, id: userId },
          role: { type: PolicyPrincipalTypes.ROLE, id: roles.user },
          domain: orgAlphaDomain,
        }),
      ),
      toRow(
        AuthorizationPolicyBuilder.grant({
          subject: { type: PolicyPrincipalTypes.ROLE, id: roles.user },
          permission: { type: PolicyPrincipalTypes.PERMISSION, id: perms.readConfig },
          action: AuthorizationActions.READ,
          effect: AuthorizationDecisions.ALLOW,
          domain: orgAlphaDomain,
        }),
      ),
      // Explicit deny at user level overrides the role-level allow
      toRow(
        AuthorizationPolicyBuilder.grant({
          subject: { type: PolicyPrincipalTypes.USER, id: userId },
          permission: { type: PolicyPrincipalTypes.PERMISSION, id: perms.readConfig },
          action: AuthorizationActions.READ,
          effect: AuthorizationDecisions.DENY,
          domain: orgAlphaDomain,
        }),
      ),
    ],
  };

  const policies = policyMap[username];
  if (!policies) {
    console.error(`[seed-policies] No policy mapping for username: ${username}`);
    process.exit(1);
  }

  return policies;
}

async function seedUserPolicies() {
  const idsPath = path.resolve(import.meta.dir, '../app_data/seed-ids.json');
  const ids: SeedIds = JSON.parse(readFileSync(idsPath, 'utf-8'));

  const client = await pool.connect();
  try {
    // Look up userId from User table
    const userResult = await client.query(`SELECT id FROM "User" WHERE username = $1`, [username]);

    if (userResult.rows.length === 0) {
      console.error(`[seed-policies] User not found: ${username}`);
      process.exit(1);
    }

    const userId: string = userResult.rows[0].id;
    const policies = buildPolicies({ userId, ids });

    await client.query('BEGIN');

    for (const p of policies) {
      await client.query(
        `INSERT INTO "PolicyDefinition"
           (id, variant, subject_type, subject_id, target_type, target_id, action, effect, domain)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          p.variant,
          p.subjectType,
          p.subjectId,
          p.targetType,
          p.targetId,
          p.action,
          p.effect,
          p.domain,
        ],
      );
    }

    await client.query('COMMIT');
    console.log(
      `[seed-policies] Seeded ${policies.length} policy rows for ${username} (userId: ${userId})`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[seed-policies] Failed for ${username}:`, error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedUserPolicies();
