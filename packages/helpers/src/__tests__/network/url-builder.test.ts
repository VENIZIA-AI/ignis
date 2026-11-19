import { describe, expect, test } from 'bun:test';
import { BaseNetworkRequest } from '@/modules/network/http-request/base-network-request.helper';
import { NativeFetcher } from '@/modules/network/http-request/fetcher/native-fetcher';
import { UrlBuilder } from '@/modules/network/utilities/url-builder';

const BASE = 'https://api.example.com/v1/tenant';

const failure = (run: () => unknown): { statusCode?: number; message: string } => {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return { statusCode: Reflect.get(error, 'statusCode'), message: error.message };
    }
  }

  throw new Error('expected the call to throw');
};

describe('UrlBuilder.join: a path cannot leave the base', () => {
  test.each([
    ['a dot-dot segment', ['..', 'admin']],
    ['a dot-dot inside a path', ['users/../../admin']],
    ['a single dot segment', ['.', 'users']],
    ['a percent-encoded dot-dot', ['%2e%2e', 'admin']],
    ['a dot-dot after an encoded slash', ['users%2f..%2f..%2fadmin']],
    ['a backslash as a separator', ['users\\..\\..\\admin']],
    ['an encoded backslash', ['users%5c..%5cadmin']],
    ['a control character in the dots', ['.\t.', 'admin']],
    ['a dot-dot ended by a question mark', ['users', '..?x']],
    ['a dot-dot with a trailing space', ['users', '.. ']],
  ])('%s is a 400', (_name, paths) => {
    const error = failure(() => UrlBuilder.join({ baseUrl: BASE, paths, scope: 'T' }));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('[T] A request path must stay under the base path');
  });

  test('the refused path is echoed on one line, escaped', () => {
    const error = failure(() => UrlBuilder.join({ baseUrl: BASE, paths: ['.\n.'], scope: 'T' }));

    expect(error.message).not.toContain('\n');
    expect(error.message).toContain('\\u000a');
  });

  test.each([
    [['products'], `${BASE}/products`],
    [['/products'], `${BASE}/products`],
    [['products', 'a b'], `${BASE}/products/a%20b`],
    [['products', 'a..b'], `${BASE}/products/a..b`],
    [['products', '...'], `${BASE}/products/...`],
    [['products', 'caf%C3%A9'], `${BASE}/products/caf%C3%A9`],
  ])('the paths %j join as %s', (paths, expected) => {
    expect(UrlBuilder.join({ baseUrl: BASE, paths, scope: 'T' }).toString()).toBe(expected);
  });

  test('a base with a trailing slash, and one with no path, join the same way', () => {
    expect(UrlBuilder.join({ baseUrl: `${BASE}/`, paths: ['p'], scope: 'T' }).toString()).toBe(
      `${BASE}/p`,
    );
    expect(
      UrlBuilder.join({ baseUrl: 'https://api.example.com', paths: ['p'], scope: 'T' }).toString(),
    ).toBe('https://api.example.com/p');
  });

  test('a builder result that leaves the origin or the base path is refused', () => {
    const toText = UrlBuilder.toText;

    try {
      UrlBuilder.toText = () => 'https://evil.example/v1/tenant/x';
      expect(
        failure(() => UrlBuilder.join({ baseUrl: BASE, paths: ['x'], scope: 'T' })).statusCode,
      ).toBe(400);
      UrlBuilder.toText = () => 'https://api.example.com/v1/other/x';
      expect(
        failure(() => UrlBuilder.join({ baseUrl: BASE, paths: ['x'], scope: 'T' })).statusCode,
      ).toBe(400);
    } finally {
      UrlBuilder.toText = toText;
    }
  });
});

describe('UrlBuilder.join: a double slash', () => {
  test('is an empty segment: refused with isDoubleSlashRefused, joined as it is without', () => {
    const paths = ['products', '//evil.example/x'];

    expect(
      failure(() =>
        UrlBuilder.join({ baseUrl: BASE, paths, scope: 'T', isDoubleSlashRefused: true }),
      ).message,
    ).toContain('double slash');
    expect(UrlBuilder.join({ baseUrl: BASE, paths, scope: 'T' }).toString()).toBe(
      `${BASE}/products//evil.example/x`,
    );
  });

  test('a path with one separator is not a double slash', () => {
    expect(
      UrlBuilder.join({
        baseUrl: `${BASE}/`,
        paths: ['a/b', '/c'],
        scope: 'T',
        isDoubleSlashRefused: true,
      }).toString(),
    ).toBe(`${BASE}/a/b/c`);
  });
});

describe('UrlBuilder.assertBase and a relative base', () => {
  test.each([
    ['a path-relative base', 'api', 'neither absolute nor a path from the origin'],
    ['a host without a scheme', 'localhost:3000', 'neither absolute nor a path from the origin'],
    ['a query in the base', 'https://a.example/v1?key=1', 'query or a fragment'],
    ['a fragment in the base', 'https://a.example/v1#x', 'query or a fragment'],
  ])('%s is refused', (_name, baseUrl, message) => {
    const error = failure(() => UrlBuilder.join({ baseUrl, paths: ['p'], scope: 'T' }));

    expect(error.statusCode).toBe(500);
    expect(error.message).toContain(message);
  });

  test('a relative base resolves against the origin it is given, and needs one', () => {
    expect(
      UrlBuilder.join({
        baseUrl: '/api',
        paths: ['p'],
        scope: 'T',
        origin: 'https://page.example',
      }).toString(),
    ).toBe('https://page.example/api/p');
    expect(
      failure(() => UrlBuilder.join({ baseUrl: '/api', paths: ['p'], scope: 'T' })).message,
    ).toContain('needs a page or worker location');
  });
});

describe('BaseNetworkRequest.getRequestUrl uses the builder', () => {
  class Client extends BaseNetworkRequest<'native'> {
    constructor(baseUrl: string) {
      super({ name: 'Client', baseUrl, fetcher: new NativeFetcher({ name: 'Client' }) });
    }
  }

  test('what it accepted before still joins', () => {
    expect(new Client('http://example.test/').getRequestUrl({ paths: ['users', '10'] })).toBe(
      'http://example.test/users/10',
    );
  });

  test.each([
    ['a dot-dot', ['users', '..', 'admin'], 'stay under the base path'],
    ['an encoded dot-dot', ['users', '%2e%2e'], 'stay under the base path'],
    ['a backslash', ['users\\x'], 'stay under the base path'],
    ['a double slash', ['users', '//x'], 'double slash'],
  ])('%s is now refused with a 400', (_name, paths, message) => {
    const error = failure(() => new Client('http://example.test').getRequestUrl({ paths }));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain(message);
    expect(error.message).toContain('[Client]');
  });
});
