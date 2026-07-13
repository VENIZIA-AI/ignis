import { describe, expect, test } from 'bun:test';
import { BaseNetworkRequest, NodeFetcher } from '@/modules/network';

const buildRequest = (opts: { baseUrl?: string }) => {
  const fetcher = new NodeFetcher({ name: 'base-network-request', defaultConfigs: {} });

  const request = new BaseNetworkRequest<'node-fetch'>({
    name: 'base-network-request',
    baseUrl: opts.baseUrl,
    fetcher,
  });

  return { request, fetcher };
};

describe('BaseNetworkRequest - fetcher plumbing', () => {
  test('getNetworkService returns the SAME fetcher instance it was built with', () => {
    const { request, fetcher } = buildRequest({ baseUrl: 'http://example.test' });

    expect(request.getNetworkService()).toBe(fetcher);
  });

  test('getWorker delegates to the fetcher worker', () => {
    const { request, fetcher } = buildRequest({ baseUrl: 'http://example.test' });

    expect(request.getWorker()).toBe(fetcher.getWorker());
  });

  test('the scope and identifier come from the name', () => {
    const { request } = buildRequest({ baseUrl: 'http://example.test' });

    expect(request.getIdentifier()).toBe('base-network-request');
    expect(request.scope).toBe('base-network-request');
  });
});

describe('BaseNetworkRequest - getRequestPath', () => {
  test('every segment is prefixed with a single slash', () => {
    const { request } = buildRequest({ baseUrl: 'http://example.test' });

    expect(request.getRequestPath({ paths: ['users', '10', 'roles'] })).toBe('/users/10/roles');
  });

  test('segments that ALREADY carry a leading slash are not doubled', () => {
    const { request } = buildRequest({ baseUrl: 'http://example.test' });

    expect(request.getRequestPath({ paths: ['/users', '/10'] })).toBe('/users/10');
  });

  test('an empty path list joins to an empty string', () => {
    const { request } = buildRequest({ baseUrl: 'http://example.test' });

    expect(request.getRequestPath({ paths: [] })).toBe('');
  });
});

describe('BaseNetworkRequest - getRequestUrl', () => {
  test('the configured baseUrl is joined with the paths', () => {
    const { request } = buildRequest({ baseUrl: 'http://example.test' });

    expect(request.getRequestUrl({ paths: ['users'] })).toBe('http://example.test/users');
  });

  test('a TRAILING slash on the baseUrl does not produce a double slash', () => {
    const { request } = buildRequest({ baseUrl: 'http://example.test/' });

    expect(request.getRequestUrl({ paths: ['users'] })).toBe('http://example.test/users');
  });

  test('an explicit baseUrl overrides the configured one', () => {
    const { request } = buildRequest({ baseUrl: 'http://example.test' });

    expect(request.getRequestUrl({ baseUrl: 'http://other.test/', paths: ['users'] })).toBe(
      'http://other.test/users',
    );
  });

  test('a baseUrl with a path prefix keeps that prefix', () => {
    const { request } = buildRequest({ baseUrl: 'http://example.test/api/v1' });

    expect(request.getRequestUrl({ paths: ['users', '10'] })).toBe(
      'http://example.test/api/v1/users/10',
    );
  });

  test('NO baseUrl anywhere throws a 500 instead of building a relative url', () => {
    const { request } = buildRequest({});

    expect(() => {
      request.getRequestUrl({ paths: ['users'] });
    }).toThrow('Invalid configuration for third party request base url');
  });

  test('an explicit EMPTY baseUrl throws - it does NOT silently fall back to the configured one', () => {
    const { request } = buildRequest({ baseUrl: 'http://example.test' });

    expect(() => {
      request.getRequestUrl({ baseUrl: '', paths: ['users'] });
    }).toThrow('Invalid configuration for third party request base url');
  });
});
