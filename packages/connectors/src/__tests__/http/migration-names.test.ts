import type {
  HttpRepository,
  IAuthToken,
  IHttpDataSourceSettings,
  IHttpRequestContext,
  THttpFetch,
} from '@/http';
import { describe, expect, test } from 'bun:test';
import type { THttpHeaders, TNativeFetchSender } from '@venizia/ignis-helpers/core';

/** The replacements the migration of `remove-unused-network-exports` names must compile: this file is that check. */
type TRepositoryOptions = NonNullable<Parameters<HttpRepository['existsWith']>[0]['options']>;
type TResolvers = NonNullable<IHttpDataSourceSettings['resolvers']>;
type TAuthTokenResolver = NonNullable<TResolvers['authToken']>;
type THeadersResolver = NonNullable<TResolvers['headers']>;

describe('the replacement types of the removed connectors/http names', () => {
  test('compile, and THttpFetch is the helpers sender type', () => {
    const options: TRepositoryOptions = {};
    const resolveToken: TAuthTokenResolver = (
      _context: IHttpRequestContext,
    ): IAuthToken | undefined => undefined;
    const resolveHeaders: THeadersResolver = (_context): THttpHeaders | undefined => undefined;
    const sender: THttpFetch = async () => new Response('ok');
    const nativeSender: TNativeFetchSender = sender;

    expect(typeof resolveToken).toBe('function');
    expect(typeof resolveHeaders).toBe('function');
    expect(typeof nativeSender).toBe('function');
    expect(options).toEqual({});
  });
});
