import { Authentication } from '@venizia/ignis';
import type { IJWTTokenPayload, TContext } from '@venizia/ignis';
import { describe, expect, test } from 'bun:test';
import type { Env } from 'hono';
// The augmentation of `IAuthUser` is part of the program through this import.
import '@/common/auth-claims';

type TRoles = Array<string | { identifier: string }> | undefined;

/** Compiles only when the claim is typed as declared: no cast, no parse. */
const readRoles = (context: TContext<Env>): TRoles =>
  context.get(Authentication.CURRENT_USER)?.roles;
const readTokenRoles = (payload: IJWTTokenPayload): TRoles => payload.roles;

describe('the extra claims an app declares on IAuthUser', () => {
  test('reach the current user and the token payload typed, with no cast', () => {
    expect(readRoles).toBeFunction();
    expect(readTokenRoles({ userId: 1, roles: [] })).toEqual([]);
  });
});
