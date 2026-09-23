// Smoke test: boots the real application on a free port with an in-memory database and calls its
// endpoints over HTTP.
import { z } from '@hono/zod-openapi';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Application } from '../application';

const HOST = '127.0.0.1';

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

describe('sqlite-quickstart', () => {
  let application: Application;
  let baseUrl = '';
  let noteId = '';

  const post = (opts: { path: string; body: object }) =>
    fetch(`${baseUrl}${opts.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts.body),
    });

  beforeAll(async () => {
    // libsql treats a bare `:memory:` url as a local, file-protocol client, so transactions and
    // migrations behave exactly as they would against a file - the test never touches app_data/.
    process.env.APP_ENV_SQLITE_URL = ':memory:';

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
    await application.stop();
  });

  test('GET /health answers', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
  });

  test('POST /notes creates a note with a UUID v7 id', async () => {
    const response = await post({ path: '/notes', body: { title: 'First note' } });
    expect(response.status).toBe(201);

    const { data } = NoteResponse.parse(await response.json());
    expect(data.title).toBe('First note');
    noteId = data.id;
  });

  test('GET /notes/:id returns the note', async () => {
    const response = await fetch(`${baseUrl}/notes/${noteId}`);
    expect(response.status).toBe(200);
    expect(NoteResponse.parse(await response.json()).data.id).toBe(noteId);
  });

  test('GET /notes with include returns the related comments', async () => {
    const created = await post({ path: '/comments', body: { noteId, text: 'A comment' } });
    expect(created.status).toBe(201);

    const filter = encodeURIComponent(JSON.stringify({ include: [{ relation: 'comments' }] }));
    const response = await fetch(`${baseUrl}/notes?filter=${filter}`);
    expect(response.status).toBe(200);

    const { data } = NoteListResponse.parse(await response.json());
    expect(data.find(note => note.id === noteId)?.comments).toEqual([
      expect.objectContaining({ noteId, text: 'A comment' }),
    ]);
  });

  test('DELETE /notes/:id removes the note', async () => {
    const deleted = await fetch(`${baseUrl}/notes/${noteId}`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);

    // A missing id is not an error: the read answers 200 with an empty envelope.
    const response = await fetch(`${baseUrl}/notes/${noteId}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 0, data: null });
  });

  test('GET /doc/openapi.json serves the API description', async () => {
    const response = await fetch(`${baseUrl}/doc/openapi.json`);
    expect(response.status).toBe(200);
  });
});
