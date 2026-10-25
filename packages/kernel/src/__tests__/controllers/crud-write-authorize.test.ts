import { AuthorizationActions } from '@/base/auth/authorize/common/constants';
import { ControllerFactory } from '@/base/controllers/factory/controller';
import { AbstractEntity } from '@/base/models';
import { z } from '@hono/zod-openapi';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

const itemSchema = z.object({ id: z.string(), title: z.string() });
const schemas: Record<string, AnyType> = { item: itemSchema };

class AuthorizeProbeItem extends AbstractEntity<typeof itemSchema> {
  constructor() {
    super({ name: AuthorizeProbeItem.name });
  }

  getSchema<T>(): T {
    return schemas.item;
  }
}

const READ = { action: AuthorizationActions.READ, resource: 'Item' };
const WRITE = { action: AuthorizationActions.WRITE, resource: 'Item' };
const WRITE_VERBS = ['create', 'updateById', 'updateBy', 'deleteById', 'deleteBy'] as const;

const define = (opts: Record<string, AnyType>) => {
  return () =>
    ControllerFactory.defineCrudController({
      entity: AuthorizeProbeItem,
      repository: { name: 'ItemRepository' },
      controller: { name: 'ItemController', basePath: '/items', ...opts.controller },
      authorize: opts.authorize,
      routes: opts.routes,
    });
};

const OVERRIDE_ALL = Object.fromEntries(WRITE_VERBS.map((verb) => [verb, { authorize: WRITE }]));

describe('defineCrudController - a write verb must not inherit a read-only authorize', () => {
  test('refuses all five write verbs when none declares its own authorize', () => {
    expect(define({ authorize: READ })).toThrow(
      /ItemController\.create.*ItemController\.updateById.*ItemController\.updateBy.*ItemController\.deleteById.*ItemController\.deleteBy/,
    );
  });

  test('with no enabledRoutes at all every write verb counts, the bulk ones included', () => {
    const attempt = define({ authorize: READ, routes: { create: { authorize: WRITE } } });

    expect(attempt).toThrow(/ItemController\.updateBy\b/);
    expect(attempt).toThrow(/ItemController\.deleteBy\b/);
    expect(attempt).not.toThrow(/ItemController\.create\b/);
  });

  test('a bulk verb in the error points at dropping it through enabledRoutes', () => {
    expect(define({ authorize: READ, routes: { create: { authorize: WRITE } } })).toThrow(
      /bulk routes.*controller\.enabledRoutes/,
    );
    const onlyById = Object.fromEntries(
      (['create', 'updateBy', 'deleteBy'] as const).map((verb) => [verb, { authorize: WRITE }]),
    );
    expect(define({ authorize: READ, routes: onlyById })).not.toThrow(/bulk routes/);
  });

  test('names the controller, the inherited spec and the fix', () => {
    expect(define({ authorize: READ })).toThrow(/controller: ItemController/);
    expect(define({ authorize: READ })).toThrow(/action: read, resource: Item/);
    expect(define({ authorize: READ })).toThrow(/routes\.<verb>\.authorize.*controller\.readonly/);
  });

  test.each(WRITE_VERBS)('names %s when only that verb is left to inherit', (verb) => {
    const routes = Object.fromEntries(
      WRITE_VERBS.filter((other) => other !== verb).map((other) => [other, { authorize: WRITE }]),
    );

    expect(define({ authorize: READ, routes })).toThrow(new RegExp(`ItemController\\.${verb}\\b`));
  });

  test('accepts a controller whose write verbs each declare their own authorize', () => {
    expect(define({ authorize: READ, routes: OVERRIDE_ALL })).not.toThrow();
  });

  test('an explicit { skip: true } counts as declaring one', () => {
    const routes = Object.fromEntries(
      WRITE_VERBS.map((verb) => [verb, { authorize: { skip: true } }]),
    );

    expect(define({ authorize: READ, routes })).not.toThrow();
  });

  test('an array on the route counts as declaring one', () => {
    const routes = Object.fromEntries(WRITE_VERBS.map((verb) => [verb, { authorize: [WRITE] }]));

    expect(define({ authorize: READ, routes })).not.toThrow();
  });

  test('a route that skips authentication inherits nothing', () => {
    const routes = Object.fromEntries(
      WRITE_VERBS.map((verb) => [verb, { authenticate: { skip: true } }]),
    );

    expect(define({ authorize: READ, routes })).not.toThrow();
  });

  test('readonly never generates a write route, so it is accepted', () => {
    expect(define({ authorize: READ, controller: { readonly: true } })).not.toThrow();
  });

  test('a write verb that is not enabled is not checked', () => {
    const routes = Object.fromEntries(WRITE_VERBS.map((verb) => [verb, { enabled: false }]));

    expect(define({ authorize: READ, routes })).not.toThrow();
  });

  test('enabledRoutes decides which verbs count', () => {
    expect(
      define({ authorize: READ, controller: { enabledRoutes: ['find', 'count'] } }),
    ).not.toThrow();
    expect(define({ authorize: READ, controller: { enabledRoutes: ['find', 'create'] } })).toThrow(
      /ItemController\.create/,
    );
  });

  test('an array of only read specs is refused, one with a write spec is accepted', () => {
    expect(define({ authorize: [READ, { ...READ, resource: 'Other' }] })).toThrow(
      /ItemController\.create/,
    );
    expect(define({ authorize: [READ, WRITE] })).not.toThrow();
  });

  test('a controller-level authorize that is not read, or none at all, is accepted', () => {
    expect(define({ authorize: WRITE })).not.toThrow();
    expect(define({ authorize: { action: 'custom-ops', resource: 'Item' } })).not.toThrow();
    expect(define({ authorize: undefined })).not.toThrow();
  });

  test('read routes may keep inheriting the read spec', () => {
    expect(define({ authorize: READ, routes: OVERRIDE_ALL })).not.toThrow();
  });
});
