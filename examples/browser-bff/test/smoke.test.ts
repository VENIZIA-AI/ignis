// Smoke test: starts the real Worker entry in a Bun Worker with an in-memory database and calls its
// controllers through the same transport the page uses.
import { z } from '@hono/zod-openapi';
import { WorkerBffTransport } from '@venizia/ignis-worker';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

// The page never reaches this origin: the transport rewrites every request onto its own.
const BASE_URL = 'http://localhost/api';

// Every CRUD route answers `{ count, data }`.
const NoteResponse = z.object({
  data: z.object({ id: z.uuid({ version: 'v7' }), title: z.string() }),
});
const NoteListResponse = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      comments: z.array(z.object({ noteId: z.string(), text: z.string() })),
    }),
  ),
});

describe('browser-bff', () => {
  let worker: Worker;
  let transport: WorkerBffTransport;
  let noteId = '';

  const call = (opts: { path: string; method?: string; body?: object }) =>
    transport.fetch({
      request: new Request(`${BASE_URL}${opts.path}`, {
        method: opts.method ?? 'GET',
        headers: { 'content-type': 'application/json' },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      }),
    });

  beforeAll(() => {
    // Unset means an in-memory database; the Worker inherits this environment.
    delete process.env.APP_ENV_PGLITE_DATA_DIR;

    worker = new Worker(new URL('../src/worker/index.ts', import.meta.url), { type: 'module' });
    transport = new WorkerBffTransport({ worker });
  });

  afterAll(() => {
    transport.close();
    worker.terminate();
  });

  test('POST /notes creates a note with a UUID v7 id', async () => {
    const response = await call({ path: '/notes', method: 'POST', body: { title: 'First note' } });
    expect(response.status).toBe(201);

    const { data } = NoteResponse.parse(await response.json());
    expect(data.title).toBe('First note');
    noteId = data.id;
  });

  test('GET /notes/:id returns the note', async () => {
    const response = await call({ path: `/notes/${noteId}` });
    expect(response.status).toBe(200);
    expect(NoteResponse.parse(await response.json()).data.id).toBe(noteId);
  });

  test('GET /notes with include returns the related comments', async () => {
    const created = await call({
      path: '/comments',
      method: 'POST',
      body: { noteId, text: 'A comment' },
    });
    expect(created.status).toBe(201);

    const filter = encodeURIComponent(JSON.stringify({ include: [{ relation: 'comments' }] }));
    const response = await call({ path: `/notes?filter=${filter}` });
    expect(response.status).toBe(200);

    const { data } = NoteListResponse.parse(await response.json());
    expect(data.find(note => note.id === noteId)?.comments).toEqual([
      expect.objectContaining({ noteId, text: 'A comment' }),
    ]);
  });

  test('DELETE /notes/:id removes the note', async () => {
    const deleted = await call({ path: `/notes/${noteId}`, method: 'DELETE' });
    expect(deleted.status).toBe(200);

    // A missing id is not an error: the read answers 200 with an empty envelope.
    const response = await call({ path: `/notes/${noteId}` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 0, data: null });
  });
});
