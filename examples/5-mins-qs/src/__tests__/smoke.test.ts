// Smoke test: runs src/index.ts exactly as the quickstart page tells the reader to, on a free port,
// and calls its two endpoints over HTTP.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getError } from '@venizia/ignis-helpers';
import path from 'node:path';

const HOST = '127.0.0.1';
const START_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 100;

const findFreePort = async () => {
  const probe = Bun.serve({ hostname: HOST, port: 0, fetch: () => new Response() });
  const port = probe.port;
  await probe.stop(true);
  return port;
};

const waitForServer = async (opts: { url: string; process: Bun.Subprocess }) => {
  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (opts.process.exitCode !== null) {
      throw getError({
        message: `[smoke] src/index.ts exited early | Code: ${opts.process.exitCode}`,
      });
    }

    const isUp = await fetch(opts.url).then(
      response => response.ok,
      () => false,
    );

    if (isUp) {
      return;
    }

    await Bun.sleep(POLL_INTERVAL_MS);
  }

  throw getError({
    message: `[smoke] server did not answer within ${START_TIMEOUT_MS} ms | Url: ${opts.url}`,
  });
};

describe('5-mins-qs', () => {
  let server: Bun.Subprocess;
  let baseUrl = '';

  beforeAll(async () => {
    const port = await findFreePort();
    baseUrl = `http://${HOST}:${port}/api`;

    server = Bun.spawn(['bun', 'run', 'src/index.ts'], {
      cwd: path.resolve(import.meta.dir, '../..'),
      env: { ...process.env, PORT: String(port) },
      stdout: 'ignore',
      stderr: 'inherit',
    });

    await waitForServer({ url: `${baseUrl}/hello`, process: server });
  });

  afterAll(async () => {
    server?.kill();
    await server?.exited;
  });

  test('GET /hello says hello', async () => {
    const response = await fetch(`${baseUrl}/hello`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'Hello from IGNIS!' });
  });

  test('GET /doc/explorer serves the API reference', async () => {
    const response = await fetch(`${baseUrl}/doc/explorer`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });
});
