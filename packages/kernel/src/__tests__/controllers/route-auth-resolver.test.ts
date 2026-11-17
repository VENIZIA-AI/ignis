import 'reflect-metadata';
import type { IAuthorizationSpec } from '@/base/auth/authorize/common/types';
import { RouteConfigResolver } from '@/base/controllers/factory/definition';
import { describe, expect, test } from 'bun:test';

const READ_SPEC: IAuthorizationSpec = { action: 'read', resource: 'asset' };
const WRITE_SPEC: IAuthorizationSpec = { action: 'write', resource: 'asset' };

describe('RouteConfigResolver.resolveAuthenticate', () => {
  test('no endpoint config inherits the controller', () => {
    expect(
      RouteConfigResolver.resolveAuthenticate({ controller: { strategies: ['jwt'], mode: 'all' } }),
    ).toEqual({ strategies: ['jwt'], mode: 'all' });
  });

  test('nothing anywhere is no strategy at all', () => {
    expect(RouteConfigResolver.resolveAuthenticate({})).toEqual({
      strategies: [],
      mode: undefined,
    });
  });

  test('an endpoint config beats the controller, field by field', () => {
    expect(
      RouteConfigResolver.resolveAuthenticate({
        controller: { strategies: ['jwt'], mode: 'all' },
        endpoint: { strategies: ['basic'] },
      }),
    ).toEqual({ strategies: ['basic'], mode: 'all' });
  });

  test('skip leaves the route with no strategy', () => {
    expect(
      RouteConfigResolver.resolveAuthenticate({
        controller: { strategies: ['jwt'] },
        endpoint: { skip: true },
      }),
    ).toEqual({ strategies: [] });
  });
});

describe('RouteConfigResolver.resolveAuthorize', () => {
  test('no endpoint config inherits the controller', () => {
    expect(RouteConfigResolver.resolveAuthorize({ controller: READ_SPEC })).toEqual(READ_SPEC);
  });

  test('an endpoint spec, or a list of them, beats the controller', () => {
    expect(
      RouteConfigResolver.resolveAuthorize({
        controller: READ_SPEC,
        endpoint: { authorize: WRITE_SPEC },
      }),
    ).toEqual(WRITE_SPEC);
    expect(
      RouteConfigResolver.resolveAuthorize({
        controller: READ_SPEC,
        endpoint: { authorize: [READ_SPEC, WRITE_SPEC] },
      }),
    ).toEqual([READ_SPEC, WRITE_SPEC]);
  });

  test('authorize.skip and authenticate.skip each leave the route unauthorized', () => {
    expect(
      RouteConfigResolver.resolveAuthorize({
        controller: READ_SPEC,
        endpoint: { authorize: { skip: true } },
      }),
    ).toBeUndefined();
    expect(
      RouteConfigResolver.resolveAuthorize({
        controller: READ_SPEC,
        endpoint: { authenticate: { skip: true }, authorize: WRITE_SPEC },
      }),
    ).toBeUndefined();
  });
});
