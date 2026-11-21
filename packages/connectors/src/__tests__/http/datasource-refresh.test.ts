import { RejectionUtility } from '@venizia/dev-configs/testing';
import type { IHttpRequestContext } from '@/http/common/types';
import { HttpDataSource } from '@/http/datasource';
import { afterEach, describe, expect, test } from 'bun:test';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const BODY = {
  error: {
    message: 'session expired',
    normalized: { code: 'auth.expired', text: 'The session expired' },
  },
};

/** Answers each request from the list in order, the last one repeating; a body is the server's JSON error envelope. */
const stub = (statuses: number[]) => {
  const sent: Array<{ headers: Headers; body: unknown }> = [];

  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    sent.push({ headers: new Headers(init?.headers), body: init?.body });
    const status = statuses[Math.min(sent.length - 1, statuses.length - 1)];

    return new Response(JSON.stringify(status === 200 ? [] : BODY), {
      status,
      headers: status === 200 ? { 'content-range': 'items 0-0/1' } : {},
    });
  }) as never;

  return sent;
};

describe('#1256: the refresh hook hears of the second 401', () => {
  test('first 401, refresh true, retry 401: the hook is called with attempt 2, its answer is ignored, the 401 stands, two sends', async () => {
    const sent = stub([401]);
    const heard: Array<number | undefined> = [];

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: (_context: IHttpRequestContext, { attempt }) => {
        heard.push(attempt);

        // `true` on the second call must not buy a third send.
        return true;
      },
    });

    await RejectionUtility.expectRejection({
      task: dataSource.read({ paths: ['tickets'] }),
      message: /401/,
    });

    expect(heard).toEqual([1, 2]);
    expect(sent).toHaveLength(2);
  });

  test('a hook answering false on the first 401 is heard once, one send', async () => {
    const sent = stub([401]);
    const heard: Array<number | undefined> = [];

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: (_context, { attempt }) => {
        heard.push(attempt);

        return false;
      },
    });

    await RejectionUtility.expectRejection({
      task: dataSource.read({ paths: ['tickets'] }),
      message: /401/,
    });

    expect(heard).toEqual([1]);
    expect(sent).toHaveLength(1);
  });

  test('a refresh that works: the retry succeeds and the hook is heard once', async () => {
    const sent = stub([401, 200]);
    let heard = 0;

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: () => {
        heard += 1;

        return true;
      },
    });

    await dataSource.read({ paths: ['tickets'] });

    expect(heard).toBe(1);
    expect(sent).toHaveLength(2);
  });
});

describe('the 401 that stands is read like any other error', () => {
  test('its server envelope reaches the error: code and text, from the kept body', async () => {
    stub([401]);

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      errorRootKey: 'error',
      onUnauthorized: () => true,
    });

    const error = await RejectionUtility.rejectionOf({
      task: dataSource.read({ paths: ['tickets'] }),
    });

    expect(String((error as Error).message)).toContain('401');
    expect(JSON.stringify(error)).toContain('auth.expired');
  });

  test('a 401 with no hook is a response the data source reads, one send', async () => {
    const sent = stub([401]);

    await RejectionUtility.expectRejection({
      task: new HttpDataSource({ baseUrl: 'https://api.example.com' }).read({ paths: ['t'] }),
      message: /401/,
    });

    expect(sent).toHaveLength(1);
  });
});

describe('the retry sends the same body', () => {
  test('a FormData body is sent again after the refresh', async () => {
    const sent = stub([401, 200]);
    const form = new FormData();

    form.set('file', new Blob(['x']), 'a.txt');

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: () => true,
    });

    await dataSource.write({ paths: ['files'], method: 'POST', body: form });

    expect(sent).toHaveLength(2);
    expect(sent[0].body).toBe(form);
    expect(sent[1].body).toBe(form);
  });
});

describe('abort during the refresh', () => {
  test('a call aborted while the session refreshed is not sent again', async () => {
    const sent = stub([401, 200]);
    const controller = new AbortController();
    const reason = new Error('user left');

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: () => {
        controller.abort(reason);

        return true;
      },
    });

    const error = await RejectionUtility.rejectionOf({
      task: dataSource.read({ paths: ['tickets'], signal: controller.signal }),
    });

    expect(error).toBe(reason);
    expect(sent).toHaveLength(1);
  });
});

describe("an abort during the refresh rejects with the caller's reason, whatever the hook answers", () => {
  test('the hook answers false after the abort: the call rejects with the abort reason, not the 401', async () => {
    const sent = stub([401]);
    const controller = new AbortController();
    const reason = new Error('user left');

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: () => {
        controller.abort(reason);

        return false;
      },
    });

    const error = await RejectionUtility.rejectionOf({
      task: dataSource.read({ paths: ['tickets'], signal: controller.signal }),
    });

    expect(error).toBe(reason);
    expect(sent).toHaveLength(1);
  });

  test('the hook hears the second 401 after an abort: the call rejects with the abort reason', async () => {
    const sent = stub([401]);
    const controller = new AbortController();
    const reason = new Error('user left');
    let heard = 0;

    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com',
      onUnauthorized: () => {
        heard += 1;

        if (heard === 2) {
          controller.abort(reason);
        }

        return true;
      },
    });

    const error = await RejectionUtility.rejectionOf({
      task: dataSource.read({ paths: ['tickets'], signal: controller.signal }),
    });

    expect(error).toBe(reason);
    expect(sent).toHaveLength(2);
  });
});
