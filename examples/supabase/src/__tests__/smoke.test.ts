// Smoke test: boots the real application against a local Postgres (docker compose) and proves RLS
// with HTTP requests. Skipped when the database is unreachable - this example is not in
// EXAMPLES_SMOKE, so CI never needs the database up. Bun awaits an async `describe` callback before
// collecting its tests, so the reachability probe can gate `describe.skipIf` without a top-level
// await (this package stays CommonJS, like every other example).
import { applicationEnvironment } from '@venizia/ignis-helpers';
import { uuidV4 } from '@venizia/ignis-helpers/uuid';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import postgres from 'postgres';
import { z } from '@hono/zod-openapi';
import { mintToken } from '../token';
import { Application } from '../application';

const HOST = '127.0.0.1';
const DATABASE_URL = 'postgresql://postgres:postgres@localhost:15433/postgres';
const JWT_SECRET = 'smoke-test-secret';

const NoteSchema = z.object({ id: z.string(), ownerId: z.string(), title: z.string() });
const NoteListResponse = z.object({ data: z.array(NoteSchema), count: z.number() });
const CountResponse = z.object({ count: z.number() });

/** A short-timeout probe, never the real driver: any failure means "not reachable", not "broken". */
const isDatabaseReachable = async (opts: { url: string }): Promise<boolean> => {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- postgres-js's own option name
  const client = postgres(opts.url, { connect_timeout: 2, max: 1 });

  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 1 });
  }
};

describe('supabase-example', async () => {
  const reachable = await isDatabaseReachable({ url: DATABASE_URL });

  describe.skipIf(!reachable)('RLS scopes every row to its owner', () => {
    let application: Application;
    let baseUrl = '';

    const userAId = uuidV4();
    const userBId = uuidV4();
    let tokenA = '';
    let tokenB = '';
    let noteAId = '';
    let noteBId = '';

    const authedFetch = (opts: { path: string; token?: string; method?: string; body?: object }) =>
      fetch(`${baseUrl}${opts.path}`, {
        method: opts.method ?? 'GET',
        headers: {
          'content-type': 'application/json',
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });

    beforeAll(async () => {
      // `applicationEnvironment` snapshots `process.env` once at import time (it is a singleton
      // shared across every copy of the module), so datasources that read through it - this one does
      // - never see a later `process.env.X = ...` assignment. `.merge()` is the sanctioned way to
      // update it after the fact.
      applicationEnvironment.merge({
        envs: {
          APP_ENV_SUPABASE_DATABASE_URL: DATABASE_URL,
          APP_ENV_SUPABASE_POOLER_MODE: 'direct',
          APP_ENV_SUPABASE_POOL_MAX: '',
          APP_ENV_JWT_SECRET: JWT_SECRET,
          APP_ENV_JWT_EXPIRES_IN: '3600',
        },
      });

      application = new Application({
        scope: 'SmokeTest',
        config: {
          host: HOST,
          port: 0,
          path: { base: '/api', isStrict: false },
          discoverArtifacts: true,
        },
      });
      application.init();
      await application.start();

      baseUrl = `http://${HOST}:${application.getServerPort()}/api`;

      tokenA = await mintToken({ subject: userAId });
      tokenB = await mintToken({ subject: userBId });
    });

    afterAll(async () => {
      await application.stop();
    });

    test('GET /health answers', async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
    });

    test('POST /notes creates a note owned by the caller, not the payload', async () => {
      const responseA = await authedFetch({
        path: '/notes',
        method: 'POST',
        token: tokenA,
        body: { title: 'A - private note' },
      });
      expect(responseA.status).toBe(200);
      const noteA = NoteSchema.parse(await responseA.json());
      expect(noteA.ownerId).toBe(userAId);
      noteAId = noteA.id;

      const responseB = await authedFetch({
        path: '/notes',
        method: 'POST',
        token: tokenB,
        body: { title: 'B - private note' },
      });
      expect(responseB.status).toBe(200);
      const noteB = NoteSchema.parse(await responseB.json());
      expect(noteB.ownerId).toBe(userBId);
      noteBId = noteB.id;
    });

    test("GET /notes returns only the caller's own rows - two users, two answers", async () => {
      const responseA = await authedFetch({ path: '/notes', token: tokenA });
      const { data: notesA } = NoteListResponse.parse(await responseA.json());
      expect(notesA.every(note => note.ownerId === userAId)).toBe(true);
      expect(notesA.some(note => note.id === noteAId)).toBe(true);
      expect(notesA.some(note => note.id === noteBId)).toBe(false);

      const responseB = await authedFetch({ path: '/notes', token: tokenB });
      const { data: notesB } = NoteListResponse.parse(await responseB.json());
      expect(notesB.every(note => note.ownerId === userBId)).toBe(true);
      expect(notesB.some(note => note.id === noteBId)).toBe(true);
      expect(notesB.some(note => note.id === noteAId)).toBe(false);
    });

    test('GET /notes/unscoped sees every row - the control group with no auth context', async () => {
      const response = await authedFetch({ path: '/notes/unscoped' });
      expect(response.status).toBe(200);

      const { data } = NoteListResponse.parse(await response.json());
      expect(data.some(note => note.id === noteAId)).toBe(true);
      expect(data.some(note => note.id === noteBId)).toBe(true);
    });

    test("DELETE someone else's note matches nothing - RLS, not a permission error", async () => {
      const response = await authedFetch({
        path: `/notes/${noteBId}`,
        method: 'DELETE',
        token: tokenA,
      });
      expect(response.status).toBe(200);
      expect(CountResponse.parse(await response.json()).count).toBe(0);
    });

    test("DELETE /notes/:id removes the caller's own note", async () => {
      const response = await authedFetch({
        path: `/notes/${noteAId}`,
        method: 'DELETE',
        token: tokenA,
      });
      expect(response.status).toBe(200);
      expect(CountResponse.parse(await response.json()).count).toBe(1);
    });

    test('GET /doc/openapi.json serves the API description', async () => {
      const response = await fetch(`${baseUrl}/doc/openapi.json`);
      expect(response.status).toBe(200);
    });
  });
});
