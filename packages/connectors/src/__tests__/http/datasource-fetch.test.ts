import { afterEach, describe, expect, test } from 'bun:test';
import { HttpDataSource } from '@/http/datasource';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const ok = () => Response.json([], { status: 200 });

describe('the sender of an HttpDataSource', () => {
  test('without one, the platform fetch is used, looked up per call', async () => {
    const seen: string[] = [];
    const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com/v1' });

    globalThis.fetch = (async (url: string) => {
      seen.push(url);

      return ok();
    }) as never;

    await dataSource.request({ paths: ['products'] });

    expect(seen).toEqual(['https://api.example.com/v1/products']);
  });

  test('a named sender gets the URL and the request, and the platform fetch is not touched', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com/v1',
      headers: { 'x-app': 'a' },
      fetch: async (url, init) => {
        calls.push({ url, init });

        return ok();
      },
    });

    globalThis.fetch = (() => {
      throw new Error('the platform fetch must not be called');
    }) as never;

    const response = await dataSource.request({
      paths: ['products'],
      method: 'post',
      body: { a: 1 },
    });

    expect(response.status).toBe(200);
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toBe('https://api.example.com/v1/products');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe('{"a":1}');
    expect(new Headers(calls[0]?.init.headers).get('x-app')).toBe('a');
    expect(new Headers(calls[0]?.init.headers).get('content-type')).toBe('application/json');
  });

  test('the 401 retry goes through the named sender too', async () => {
    let attempt = 0;
    const dataSource = new HttpDataSource({
      baseUrl: 'https://api.example.com/v1',
      onUnauthorized: () => true,
      fetch: async () => {
        attempt += 1;

        return attempt === 1 ? new Response(null, { status: 401 }) : ok();
      },
    });

    const response = await dataSource.request({ paths: ['x'] });

    expect(response.status).toBe(200);
    expect(attempt).toBe(2);
  });
});
