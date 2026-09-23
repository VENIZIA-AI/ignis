// Smoke test: boots the real application on a free port against a local Typesense and calls its
// endpoints over HTTP. `test.skipIf` skips every test (not fails) when Typesense is unreachable, so
// `bun test` stays green with no docker running - `docker compose up -d` first turns them on.
import { z } from '@hono/zod-openapi';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getError } from '@venizia/ignis-helpers';
import { uuidV4 } from '@venizia/ignis-helpers/uuid';
import { Application } from '../application';

const HOST = '127.0.0.1';
const TYPESENSE_URL = process.env.TYPESENSE_URL ?? 'http://127.0.0.1:18108';
const SEARCH_CONVERGE_TIMEOUT_MS = 5_000;
const SEARCH_POLL_INTERVAL_MS = 100;

/**
 * `describe`/`test.skipIf` need this decided before any `await` runs, and this file has no
 * `package.json` `"type": "module"` (nodenext then forbids top-level await) - so the probe itself
 * runs in a throwaway `bun -e` subprocess, which is exempt from that rule, and reports back via its
 * exit code.
 */
const isTypesenseHealthy = (opts: { url: string }): boolean => {
  const probe = Bun.spawnSync({
    cmd: [
      'bun',
      '-e',
      `process.exit(await fetch(${JSON.stringify(opts.url)}).then(r => (r.ok ? 0 : 1), () => 1))`,
    ],
  });

  return probe.exitCode === 0;
};

const isTypesenseUp = isTypesenseHealthy({ url: `${TYPESENSE_URL}/health` });

// Every CRUD route answers `{ count, data }`.
const ArticleResponse = z.object({ data: z.object({ id: z.string(), title: z.string() }) });
const SearchResponse = z.object({
  found: z.number(),
  isFoundExact: z.boolean(),
  hits: z.array(z.object({ document: z.object({ id: z.string(), category: z.string() }) })),
});
type TSearchResponse = z.infer<typeof SearchResponse>;

describe('typesense-search', () => {
  let application: Application;
  let baseUrl = '';

  const typescriptId = uuidV4();
  const draftId = uuidV4();

  const post = (opts: { path: string; body: object }) =>
    fetch(`${baseUrl}${opts.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts.body),
    });

  // Typesense indexes a write before returning, but polling briefly keeps the assertion from ever
  // being coupled to that timing guarantee.
  const searchUntil = async (opts: {
    body: object;
    predicate: (result: TSearchResponse) => boolean;
  }): Promise<TSearchResponse> => {
    const deadline = Date.now() + SEARCH_CONVERGE_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const response = await post({ path: '/articles/search', body: opts.body });
      const result = SearchResponse.parse(await response.json());

      if (opts.predicate(result)) {
        return result;
      }

      await Bun.sleep(SEARCH_POLL_INTERVAL_MS);
    }

    throw getError({
      message: `[smoke] search did not converge within ${SEARCH_CONVERGE_TIMEOUT_MS} ms`,
    });
  };

  beforeAll(async () => {
    if (!isTypesenseUp) {
      return;
    }

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
  });

  afterAll(async () => {
    // The `articles` collection lives on docker-compose's persistent volume, so anything indexed
    // here outlives this run unless it is deleted through the same HTTP routes that created it.
    if (isTypesenseUp) {
      await fetch(`${baseUrl}/articles/${typescriptId}`, { method: 'DELETE' });
      await fetch(`${baseUrl}/articles/${draftId}`, { method: 'DELETE' });
    }

    await application?.stop();
  });

  test.skipIf(!isTypesenseUp)('GET /health answers', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
  });

  test.skipIf(!isTypesenseUp)('POST /articles indexes a document', async () => {
    const response = await post({
      path: '/articles',
      body: {
        id: typescriptId,
        title: 'Getting started with TypeScript',
        content: 'TypeScript adds static typing on top of JavaScript.',
        category: 'programming',
      },
    });
    expect(response.status).toBe(201);
    expect(ArticleResponse.parse(await response.json()).data.id).toBe(typescriptId);

    // A second document, in a different category, gives the filter test something to exclude.
    const draft = await post({
      path: '/articles',
      body: {
        id: draftId,
        title: 'Draft roadmap notes',
        content: 'Unfinished notes about next quarter.',
        category: 'company',
      },
    });
    expect(draft.status).toBe(201);
  });

  test.skipIf(!isTypesenseUp)(
    'POST /articles/search (keyword) matches the title and content',
    async () => {
      const result = await searchUntil({
        body: { mode: 'keyword', query: 'TypeScript', queryBy: ['title', 'content'] },
        predicate: rs => rs.hits.some(hit => hit.document.id === typescriptId),
      });

      expect(result.hits.map(hit => hit.document.id)).not.toContain(draftId);
    },
  );

  test.skipIf(!isTypesenseUp)(
    'POST /articles/search (filter) narrows by category with a wildcard query',
    async () => {
      const result = await searchUntil({
        body: {
          mode: 'keyword',
          query: '*',
          queryBy: ['title'],
          filter: { where: { category: 'company' } },
        },
        predicate: rs => rs.hits.some(hit => hit.document.id === draftId),
      });

      expect(result.hits.map(hit => hit.document.id)).not.toContain(typescriptId);
    },
  );

  test.skipIf(!isTypesenseUp)('GET /doc/openapi.json serves the API description', async () => {
    const response = await fetch(`${baseUrl}/doc/openapi.json`);
    expect(response.status).toBe(200);
  });
});
