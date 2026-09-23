/**
 * Seed script for authorization test data.
 * Creates organizations, roles, and permissions in the database.
 * Outputs IDs to ./app_data/seed-ids.json for the test script.
 *
 * Run from examples/vert: NODE_ENV=development bun run scripts/seed-authz-test-data.ts
 */
import 'dotenv-flow/config';

import { mkdirSync, writeFileSync } from 'fs';
import Redis from 'ioredis';
import path from 'path';
import { Pool } from 'pg';
import { blankToUndefined } from '@venizia/ignis-helpers';
import { uuidV7 } from '@venizia/ignis-helpers/uuid';

const pool = new Pool({
  host: blankToUndefined(process.env.APP_ENV_POSTGRES_HOST) ?? '0.0.0.0',
  port: parseInt(blankToUndefined(process.env.APP_ENV_POSTGRES_PORT) ?? '5432'),
  database: blankToUndefined(process.env.APP_ENV_POSTGRES_DATABASE) ?? 'db',
  user: blankToUndefined(process.env.APP_ENV_POSTGRES_USERNAME) ?? 'postgres',
  password: blankToUndefined(process.env.APP_ENV_POSTGRES_PASSWORD) ?? 'password',
});

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clean existing test data in FK-safe order
    await client.query('DELETE FROM "PolicyDefinition"');
    await client.query('DELETE FROM "Permission"');
    await client.query('DELETE FROM "Role"');
    await client.query('DELETE FROM "Organization"');

    // --- Organizations ---
    const orgAlphaId = uuidV7();
    const orgBetaId = uuidV7();

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
    const roleSuperAdminId = uuidV7();
    const roleAdminId = uuidV7();
    const roleUserId = uuidV7();
    const roleGuestId = uuidV7();

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
    const permReadConfigId = uuidV7();
    const permCreateUserId = uuidV7();
    const permReadDashboardId = uuidV7();

    for (const [id, code, name, subject, action, method] of [
      [permReadConfigId, 'configuration', 'Read Configuration', 'configuration', 'read', 'GET'],
      [permCreateUserId, 'user', 'Create User', 'user', 'create', 'POST'],
      [permReadDashboardId, 'dashboard', 'Read Dashboard', 'dashboard', 'read', 'GET'],
    ] as const) {
      await client.query(
        `INSERT INTO "Permission" (id, code, name, subject, action, method, scope) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, code, name, subject, action, method, 'global'],
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
    const redisDb = parseInt(blankToUndefined(process.env.APP_ENV_AUTHORZ_REDIS_DB) ?? '8');
    const redis = new Redis({
      host: blankToUndefined(process.env.APP_ENV_AUTHORZ_REDIS_HOST) ?? '0.0.0.0',
      port: parseInt(blankToUndefined(process.env.APP_ENV_AUTHORZ_REDIS_PORT) ?? '6379'),
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
};

seed();
