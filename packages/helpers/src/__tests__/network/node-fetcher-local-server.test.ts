import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { NodeFetchNetworkRequest } from '@/modules/network';

/** The ARDOR path end to end against a real server: no `fetch` stub, so what is asserted is what a server receives. */
let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === '/slow') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return new Response('late');
      }

      const body = await req.text();
      return Response.json({
        method: req.method,
        search: url.search,
        contentType: req.headers.get('content-type'),
        body,
      });
    },
  });
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.stop(true);
});

const buildRequest = () => {
  return new NodeFetchNetworkRequest({
    name: 'local-server',
    networkOptions: {
      baseUrl,
      queryString: { nullish: 'skip', nested: 'json' },
    },
  });
};

describe('NodeFetchNetworkRequest against a local server', () => {
  test('a JSON body, a JSON filter in the query and the default content type arrive intact', async () => {
    const request = buildRequest();
    const filter = { where: { id: { inq: [1, 2] } } };

    const rs = await request.getNetworkService().post({
      url: request.getRequestUrl({ paths: ['items'] }),
      params: { filter, skipped: undefined },
      body: { name: 'lamp' } as never,
    });
    const result = await rs.json();
    const received = result as {
      method: string;
      search: string;
      contentType: string | null;
      body: string;
    };

    expect(received.method).toBe('POST');
    expect(new URLSearchParams(received.search).get('filter')).toBe(JSON.stringify(filter));
    expect(received.search).not.toContain('skipped');
    expect(received.contentType).toBe('application/json; charset=utf-8');
    expect(received.body).toBe('{"name":"lamp"}');
  });

  test('a timeout aborts a slow response', async () => {
    const request = buildRequest();

    const outcome = await request
      .getNetworkService()
      .get({ url: request.getRequestUrl({ paths: ['slow'] }), timeout: 30 })
      .then(
        () => 'answered',
        () => 'aborted',
      );

    expect(outcome).toBe('aborted');
  });

  test("the caller's own signal still aborts when a timeout is set", async () => {
    const request = buildRequest();
    const controller = new AbortController();
    const pending = request.getNetworkService().get({
      url: request.getRequestUrl({ paths: ['slow'] }),
      timeout: 5_000,
      signal: controller.signal,
    });

    controller.abort();

    const outcome = await pending.then(
      () => 'answered',
      () => 'aborted',
    );

    expect(outcome).toBe('aborted');
  });
});
