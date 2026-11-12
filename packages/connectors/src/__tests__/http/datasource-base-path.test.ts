import { isApplicationError } from '@venizia/ignis-helpers/core';
import type { ApplicationError } from '@venizia/ignis-helpers/core';
import { HttpWire } from '@/http/common/wire';
import { HttpDataSource } from '@/http/datasource';
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

afterEach(() => {
  mock.restore();
});

/** A request path stays under the configured base path: no dot segment in any form can climb out of it. */
const capture = (task: () => unknown): ApplicationError => {
  try {
    task();
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected an error');
};

describe('HttpDataSource.buildUrl keeps the request path under the base path', () => {
  const dataSource = new HttpDataSource({ baseUrl: 'https://api.example.com/v1/tenant' });

  test.each([
    ['a dot-dot segment', ['..', 'admin']],
    ['a dot-dot inside a path', ['users/../../admin']],
    ['a leading dot-dot path', ['../admin']],
    ['a single dot segment', ['.', 'users']],
    ['a percent-encoded dot-dot', ['%2e%2e', 'admin']],
    ['an upper-case percent-encoded dot-dot', ['%2E%2E/admin']],
    ['a half-encoded dot-dot (.%2e)', ['.%2e/admin']],
    ['a half-encoded dot-dot (%2e.)', ['%2e./admin']],
    ['a dot-dot after an encoded slash', ['users%2f..%2f..%2fadmin']],
    ['a backslash as a separator', ['users\\..\\..\\admin']],
    ['an encoded backslash', ['users%5c..%5cadmin']],
    ['a tab inside the dots', ['.\t.', 'admin']],
    ['a newline inside the dots', ['.\n.', 'admin']],
    ['a carriage return inside the dots', ['.\r.', 'admin']],
    ['a NUL character', ['users\u0000', 'admin']],
    ['a dot-dot ended by a question mark', ['users', '..?x']],
    ['a dot-dot as the last path, ended by a question mark', ['users', 'x', '..?']],
    ['a dot-dot ended by a fragment', ['users', '42', '..#']],
    ['an encoded dot-dot ended by a question mark', ['users', '%2e%2e?']],
    ['a dot-dot inside a path, ended by a question mark', ['users', 'x/..?/avatar']],
    ['a dot-dot with a trailing space', ['users', '.. ']],
    ['a dot with a trailing space', ['users', '. ']],
    ['a dot-dot with trailing spaces before a slash', ['users', '..  /x']],
  ])('%s is a 400 validation error', (_name, paths) => {
    const error = capture(() => dataSource.buildUrl({ paths }));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('stay under the base path');
  });

  test('the refused path is echoed on one line, escaped', () => {
    const error = capture(() => dataSource.buildUrl({ paths: ['.\n.', 'FORGED'] }));

    expect(error.message).not.toContain('\n');
    expect(error.message).toContain('\\u000a');
  });

  test.each([
    [['products'], 'https://api.example.com/v1/tenant/products'],
    [['/products'], 'https://api.example.com/v1/tenant/products'],
    [['products', '42'], 'https://api.example.com/v1/tenant/products/42'],
    [['products/42/items'], 'https://api.example.com/v1/tenant/products/42/items'],
    [['products', 'a b'], 'https://api.example.com/v1/tenant/products/a%20b'],
    [['products', 'a.b'], 'https://api.example.com/v1/tenant/products/a.b'],
    [['products', '...'], 'https://api.example.com/v1/tenant/products/...'],
    [['products', '..hidden'], 'https://api.example.com/v1/tenant/products/..hidden'],
    [['products', 'v1.2'], 'https://api.example.com/v1/tenant/products/v1.2'],
    [['products', '%2e%2ehidden'], 'https://api.example.com/v1/tenant/products/%2e%2ehidden'],
    [['products', 'caf%C3%A9'], 'https://api.example.com/v1/tenant/products/caf%C3%A9'],
    [['products', '.well-known'], 'https://api.example.com/v1/tenant/products/.well-known'],
    [['products', 'a..b'], 'https://api.example.com/v1/tenant/products/a..b'],
    [['products', '@x'], 'https://api.example.com/v1/tenant/products/@x'],
    [
      ['products', '//evil.example/x'],
      'https://api.example.com/v1/tenant/products//evil.example/x',
    ],
    [['products', '100%25'], 'https://api.example.com/v1/tenant/products/100%25'],
  ])('the path %j keeps working', (paths, expected) => {
    expect(dataSource.buildUrl({ paths })).toBe(expected);
  });

  test('a base path with a trailing slash and a base without a path keep working', () => {
    expect(
      new HttpDataSource({ baseUrl: 'https://api.example.com/v1/' }).buildUrl({
        paths: ['products'],
      }),
    ).toBe('https://api.example.com/v1/products');
    expect(
      new HttpDataSource({ baseUrl: 'https://api.example.com' }).buildUrl({ paths: ['products'] }),
    ).toBe('https://api.example.com/products');
  });

  test('a dot segment is refused under a base without a path too', () => {
    const rootBase = new HttpDataSource({ baseUrl: 'https://api.example.com' });

    expect(capture(() => rootBase.buildUrl({ paths: ['..', 'x'] })).statusCode).toBe(400);
  });

  test('the query is not read as a path: a dot segment there stays a value', () => {
    expect(dataSource.buildUrl({ paths: ['products'], query: { next: '../x' } })).toBe(
      'https://api.example.com/v1/tenant/products?next=..%2Fx',
    );
  });

  test('the resolved URL is checked too: a builder that leaves the origin or the base path is refused', () => {
    const leaving = (url: string) => {
      const source = new HttpDataSource({ baseUrl: 'https://api.example.com/v1/tenant' });
      spyOn(HttpWire, 'toRequestUrl').mockReturnValue(url);

      return source;
    };

    expect(
      capture(() => leaving('https://evil.example/v1/tenant/x').buildUrl({ paths: ['x'] }))
        .statusCode,
    ).toBe(400);
    expect(
      capture(() => leaving('https://api.example.com/v1/other/x').buildUrl({ paths: ['x'] }))
        .statusCode,
    ).toBe(400);
    expect(
      capture(() => leaving('https://api.example.com/v1/tenantx').buildUrl({ paths: ['x'] }))
        .statusCode,
    ).toBe(400);
    expect(leaving('https://api.example.com/v1/tenant/x').buildUrl({ paths: ['x'] })).toBe(
      'https://api.example.com/v1/tenant/x',
    );
  });

  test('an id with a backslash is refused even encoded, as the repository sends it: a server may decode %5c into a separator', () => {
    const error = capture(() =>
      dataSource.buildUrl({ paths: ['users', encodeURIComponent('a\\b')] }),
    );

    expect(error.statusCode).toBe(400);
  });

  test('the refused path is cut at 200 characters in the message', () => {
    const error = capture(() => dataSource.buildUrl({ paths: ['..' + 'x'.repeat(5000) + '/..'] }));

    expect(error.message.length).toBeLessThan(500);
    expect(error.message).toContain('…');
  });

  test('a relative base of / has no origin to hide behind: a dot segment is refused', () => {
    const origin = Object.getOwnPropertyDescriptor(globalThis, 'location');
    Object.defineProperty(globalThis, 'location', {
      value: { origin: 'https://app.example.com' },
      configurable: true,
      writable: true,
    });

    try {
      const root = new HttpDataSource({ baseUrl: '/' });

      expect(capture(() => root.buildUrl({ paths: ['x', '..?'] })).statusCode).toBe(400);
      expect(root.buildUrl({ paths: ['x'] })).toBe('https://app.example.com/x');
    } finally {
      if (origin) {
        Object.defineProperty(globalThis, 'location', origin);
      } else {
        Reflect.deleteProperty(globalThis, 'location');
      }
    }
  });

  test.each([
    ['a query', 'https://api.example.com/v1?key=1'],
    ['a fragment', 'https://api.example.com/v1#top'],
    ['a relative base with a query', '/api?key=1'],
    ['a bare question mark', 'https://api.example.com/v1?'],
  ])('a baseUrl with %s is refused by the constructor', (_name, baseUrl) => {
    const error = capture(() => new HttpDataSource({ baseUrl }));

    expect(error.statusCode).toBe(500);
    expect(error.message).toContain('query or a fragment');
  });
});
