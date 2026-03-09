/**
 * Seed script for authorization test data.
 * Creates organizations, roles, and permissions in the database.
 * Outputs IDs to ./app_data/seed-ids.json for the test script.
 *
 * Run from examples/vert: NODE_ENV=development bun run scripts/seed-authz-test-data.ts
 */
import 'dotenv-flow/config';

import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import Redis from 'ioredis';
import path from 'path';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.APP_ENV_POSTGRES_HOST ?? '0.0.0.0',
  port: parseInt(process.env.APP_ENV_POSTGRES_PORT ?? '5432'),
  database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'db',
  user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
  password: process.env.APP_ENV_POSTGRES_PASSWORD ?? 'password',
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clean existing test data in FK-safe order
    await client.query('DELETE FROM "PolicyDefinition"');
    await client.query('DELETE FROM "Permission"');
    await client.query('DELETE FROM "Role"');
    await client.query('DELETE FROM "Organization"');

    // --- Organizations ---
    const orgAlphaId = randomUUID();
    const orgBetaId = randomUUID();

    for (const [id, identifier, name] of [
      [orgAlphaId, 'org_alpha', 'Alpha Corp'],
      [orgBetaId, 'org_beta', 'Beta Inc'],
    ] as const) {
      await client.query(
        `INSERT INTO "Organization" (id, identifier, name, status, is_active) VALUES ($1, $2, $3, $4, $5)`,
        [id, identifier, name, 'activated', true],
      );
    }

    // --- Roles ---
    const roleSuperAdminId = randomUUID();
    const roleAdminId = randomUUID();
    const roleUserId = randomUUID();
    const roleGuestId = randomUUID();

    for (const [id, identifier, name, priority] of [
      [roleSuperAdminId, '999_super-admin', 'Super Admin', 999],
      [roleAdminId, '900_admin', 'Admin', 900],
      [roleUserId, '10_user', 'User', 10],
      [roleGuestId, '1_guest', 'Guest', 1],
    ] as const) {
      await client.query(
        `INSERT INTO "Role" (id, identifier, name, priority, status) VALUES ($1, $2, $3, $4, $5)`,
        [id, identifier, name, priority, 'activated'],
      );
    }

    // --- Permissions ---
    const permReadConfigId = randomUUID();
    const permCreateUserId = randomUUID();
    const permReadDashboardId = randomUUID();

    for (const [id, code, name, subject, action] of [
      [permReadConfigId, 'configuration', 'Read Configuration', 'configuration', 'read'],
      [permCreateUserId, 'user', 'Create User', 'user', 'create'],
      [permReadDashboardId, 'dashboard', 'Read Dashboard', 'dashboard', 'read'],
    ] as const) {
      await client.query(
        `INSERT INTO "Permission" (id, code, name, subject, action, scope) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, code, name, subject, action, 'global'],
      );
    }

    await client.query('COMMIT');

    // Write IDs to JSON for the test script
    const ids = {
      organizations: { orgAlpha: orgAlphaId, orgBeta: orgBetaId },
      roles: {
        superAdmin: roleSuperAdminId,
        admin: roleAdminId,
        user: roleUserId,
        guest: roleGuestId,
      },
      permissions: {
        readConfig: permReadConfigId,
        createUser: permCreateUserId,
        readDashboard: permReadDashboardId,
      },
    };

    const outputDir = path.resolve(import.meta.dir, '../app_data');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(path.join(outputDir, 'seed-ids.json'), JSON.stringify(ids, null, 2));

    console.log('[seed-authz] Base data seeded successfully');
    console.log(JSON.stringify(ids, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[seed-authz] Seed failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  // Flush Redis authorization cache to clear stale policies from previous runs
  try {
    const redisDb = parseInt(process.env.APP_ENV_AUTHORZ_REDIS_DB ?? '8');
    const redis = new Redis({
      host: process.env.APP_ENV_AUTHORZ_REDIS_HOST ?? '0.0.0.0',
      port: parseInt(process.env.APP_ENV_AUTHORZ_REDIS_PORT ?? '6379'),
      password: process.env.APP_ENV_AUTHORZ_REDIS_PASSWORD || undefined,
      db: redisDb,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });

    await redis.flushdb();
    console.log(`[seed-authz] Redis cache flushed (db ${redisDb})`);
    redis.disconnect();
  } catch {
    console.log('[seed-authz] Redis flush skipped (not reachable)');
  }
}

seed();
