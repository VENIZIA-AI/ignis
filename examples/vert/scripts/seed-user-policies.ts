/**
 * Seeds PolicyDefinition rows for a specific test user.
 * Queries the User table to resolve userId from username,
 * then inserts role-group and permission-policy rows.
 *
 * Run from examples/vert: NODE_ENV=development bun run scripts/seed-user-policies.ts <username>
 */
import 'dotenv-flow/config';

import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';

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

interface PolicyRow {
  variant: 'group' | 'policy';
  subjectType: string;
  subjectId: string;
  targetType: string;
  targetId: string;
  action: string | null;
  effect: string | null;
  domain: string | null;
}

function buildPolicies(opts: { userId: string; ids: SeedIds }): PolicyRow[] {
  const { userId, ids } = opts;
  const { organizations: orgs, roles, permissions: perms } = ids;

  const policyMap: Record<string, PolicyRow[]> = {
    // Super admin — alwaysAllowRoles bypass
    test_superadmin: [
      {
        variant: 'group',
        subjectType: 'user',
        subjectId: userId,
        targetType: 'Role',
        targetId: roles.superAdmin,
        action: null,
        effect: null,
        domain: orgs.orgAlpha,
      },
    ],

    // Admin — has create:user via role policy in org_alpha
    test_admin: [
      {
        variant: 'group',
        subjectType: 'user',
        subjectId: userId,
        targetType: 'Role',
        targetId: roles.admin,
        action: null,
        effect: null,
        domain: orgs.orgAlpha,
      },
      {
        variant: 'policy',
        subjectType: 'Role',
        subjectId: roles.admin,
        targetType: 'Permission',
        targetId: perms.createUser,
        action: 'create',
        effect: 'allow',
        domain: orgs.orgAlpha,
      },
    ],

    // Regular user — has read:configuration via role policy in org_alpha
    test_user: [
      {
        variant: 'group',
        subjectType: 'user',
        subjectId: userId,
        targetType: 'Role',
        targetId: roles.user,
        action: null,
        effect: null,
        domain: orgs.orgAlpha,
      },
      {
        variant: 'policy',
        subjectType: 'Role',
        subjectId: roles.user,
        targetType: 'Permission',
        targetId: perms.readConfig,
        action: 'read',
        effect: 'allow',
        domain: orgs.orgAlpha,
      },
    ],

    // Guest — role assigned but no permission policies
    test_guest: [
      {
        variant: 'group',
        subjectType: 'user',
        subjectId: userId,
        targetType: 'Role',
        targetId: roles.guest,
        action: null,
        effect: null,
        domain: orgs.orgAlpha,
      },
    ],

    // Beta admin — has read:configuration in org_beta (different tenant)
    test_beta_admin: [
      {
        variant: 'group',
        subjectType: 'user',
        subjectId: userId,
        targetType: 'Role',
        targetId: roles.admin,
        action: null,
        effect: null,
        domain: orgs.orgBeta,
      },
      {
        variant: 'policy',
        subjectType: 'Role',
        subjectId: roles.admin,
        targetType: 'Permission',
        targetId: perms.readConfig,
        action: 'read',
        effect: 'allow',
        domain: orgs.orgBeta,
      },
    ],

    // No-org user — role assigned with null domain
    test_no_org: [
      {
        variant: 'group',
        subjectType: 'user',
        subjectId: userId,
        targetType: 'Role',
        targetId: roles.user,
        action: null,
        effect: null,
        domain: null,
      },
    ],

    // Denied user — has allow via role + explicit deny at user level
    test_denied: [
      {
        variant: 'group',
        subjectType: 'user',
        subjectId: userId,
        targetType: 'Role',
        targetId: roles.user,
        action: null,
        effect: null,
        domain: orgs.orgAlpha,
      },
      {
        variant: 'policy',
        subjectType: 'Role',
        subjectId: roles.user,
        targetType: 'Permission',
        targetId: perms.readConfig,
        action: 'read',
        effect: 'allow',
        domain: orgs.orgAlpha,
      },
      // Explicit deny at user level overrides the role-level allow
      {
        variant: 'policy',
        subjectType: 'user',
        subjectId: userId,
        targetType: 'Permission',
        targetId: perms.readConfig,
        action: 'read',
        effect: 'deny',
        domain: orgs.orgAlpha,
      },
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
