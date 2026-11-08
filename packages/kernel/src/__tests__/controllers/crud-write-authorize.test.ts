import { AuthorizationActions } from '@/base/auth/authorize/common/constants';
import { CrudControllerFactory } from '@/base/controllers/factory/controller';
import { CrudRoutes } from '@/base/controllers/common';
import { repository } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { z } from '@hono/zod-openapi';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { RestorableStubRepository, StubRepository } from './stub-repository';

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

@repository({ model: AuthorizeProbeItem, dataSource: 'ProbeDataSource' })
class ItemRepository extends StubRepository {}

@repository({ model: AuthorizeProbeItem, dataSource: 'ProbeDataSource' })
class SoftItemRepository extends RestorableStubRepository {}

const READ = { action: AuthorizationActions.READ, resource: 'Item' };
const WRITE = { action: AuthorizationActions.WRITE, resource: 'Item' };
const WRITE_VERBS = ['create', 'updateById', 'updateBy', 'deleteById', 'deleteBy'] as const;

const define = (opts: { authorize?: AnyType; routes?: Record<string, AnyType> }) => {
  return () =>
    CrudControllerFactory.build({
      repository: ItemRepository,
      authorize: opts.authorize,
      routes: opts.routes,
    });
};

const listed = (opts: { value: AnyType; verbs?: ReadonlyArray<string> }) =>
  Object.fromEntries((opts.verbs ?? WRITE_VERBS).map((verb) => [verb, opts.value]));

const ALL_TRUE = listed({ value: true });
const OVERRIDE_ALL = listed({ value: { authorize: WRITE } });

describe('CrudControllerFactory.build - a write verb must not inherit a read-only authorize', () => {
  test('refuses all five write verbs when none declares its own authorize', () => {
    expect(define({ authorize: READ, routes: ALL_TRUE })).toThrow(
      /ItemRepository\.create.*ItemRepository\.updateById.*ItemRepository\.updateBy.*ItemRepository\.deleteById.*ItemRepository\.deleteBy/,
    );
  });

  test('only a listed verb counts: a route that is not in routes is not checked', () => {
    const attempt = define({ authorize: READ, routes: { create: true, updateBy: true } });

    expect(attempt).toThrow(/ItemRepository\.create\b/);
    expect(attempt).toThrow(/ItemRepository\.updateBy\b/);
    expect(attempt).not.toThrow(/ItemRepository\.deleteBy\b/);
  });

  test('names the repository, the inherited spec and the fix', () => {
    const attempt = define({ authorize: READ, routes: ALL_TRUE });

    expect(attempt).toThrow(/repository: ItemRepository/);
    expect(attempt).toThrow(/action: read, resource: Item/);
    expect(attempt).toThrow(/routes\.<verb>\.authorize.*leave them out of routes/);
  });

  test.each(WRITE_VERBS)('names %s when only that verb is left to inherit', (verb) => {
    const routes = {
      ...listed({
        value: { authorize: WRITE },
        verbs: WRITE_VERBS.filter((other) => other !== verb),
      }),
      [verb]: true,
    };

    expect(define({ authorize: READ, routes })).toThrow(new RegExp(`ItemRepository\\.${verb}\\b`));
  });

  test('accepts a controller whose write verbs each declare their own authorize', () => {
    expect(define({ authorize: READ, routes: OVERRIDE_ALL })).not.toThrow();
  });

  test('an explicit { skip: true } counts as declaring one', () => {
    expect(
      define({ authorize: READ, routes: listed({ value: { authorize: { skip: true } } }) }),
    ).not.toThrow();
  });

  test('an array on the route counts as declaring one', () => {
    expect(
      define({ authorize: READ, routes: listed({ value: { authorize: [WRITE] } }) }),
    ).not.toThrow();
  });

  test('a route that skips authentication inherits nothing', () => {
    expect(
      define({ authorize: READ, routes: listed({ value: { authenticate: { skip: true } } }) }),
    ).not.toThrow();
  });

  test('a read-only controller lists no write verb, so it is accepted', () => {
    expect(define({ authorize: READ, routes: CrudRoutes.READ })).not.toThrow();
    expect(define({ authorize: READ })).not.toThrow();
  });

  test('an array of only read specs is refused, one with a write spec is accepted', () => {
    expect(define({ authorize: [READ, { ...READ, resource: 'Other' }], routes: ALL_TRUE })).toThrow(
      /ItemRepository\.create/,
    );
    expect(define({ authorize: [READ, WRITE], routes: ALL_TRUE })).not.toThrow();
  });

  test('a controller-level authorize that is not read, or none at all, is accepted', () => {
    expect(define({ authorize: WRITE, routes: ALL_TRUE })).not.toThrow();
    expect(
      define({ authorize: { action: 'custom-ops', resource: 'Item' }, routes: ALL_TRUE }),
    ).not.toThrow();
    expect(define({ authorize: undefined, routes: ALL_TRUE })).not.toThrow();
  });

  test('read routes may keep inheriting the read spec', () => {
    expect(
      define({ authorize: READ, routes: { ...CrudRoutes.READ, ...OVERRIDE_ALL } }),
    ).not.toThrow();
  });

  test('the restore routes are write verbs too', () => {
    const attempt = () =>
      CrudControllerFactory.build({
        repository: SoftItemRepository,
        authorize: READ,
        routes: { restoreById: true, restoreBy: { authorize: WRITE } },
      });

    expect(attempt).toThrow(/SoftItemRepository\.restoreById\b/);
    expect(attempt).not.toThrow(/SoftItemRepository\.restoreBy\b/);
  });
});
