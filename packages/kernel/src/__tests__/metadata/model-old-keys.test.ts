import { model } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { afterEach, describe, expect, test } from 'bun:test';

/**
 * The old `@model` keys are not read any more, and nothing throws for them at runtime. The types are what stops one:
 * a typed `@model({ ... })` that still writes a removed key is an excess property, so it fails the typecheck. Each
 * `@ts-expect-error` below is itself a check: it turns into an error of its own the day the type accepts the key again.
 */
const registry = MetadataRegistry.getInstance();

afterEach(() => {
  registry.getAllModels().clear();
});

describe('@model - the removed keys are type errors', () => {
  test('settings.defaultFilter', () => {
    // @ts-expect-error defaultFilter is not a key of IModelSettings: use settings.query.filter
    @model({ settings: { defaultFilter: { where: {} } } })
    class A extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }

    expect(A).toBeDefined();
  });

  test('settings.defaultLimit', () => {
    // @ts-expect-error defaultLimit is not a key of IModelSettings: use settings.query.limit.default
    @model({ settings: { defaultLimit: 20 } })
    class B extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }

    expect(B).toBeDefined();
  });

  test('settings.maxLimit', () => {
    // @ts-expect-error maxLimit is not a key of IModelSettings: use settings.query.limit.max
    @model({ settings: { maxLimit: 100 } })
    class C extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }

    expect(C).toBeDefined();
  });

  test('settings.scopeFilter', () => {
    // @ts-expect-error scopeFilter is not a key of IModelSettings: use settings.access
    @model({ settings: { scopeFilter: { resolve: () => null } } })
    class D extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }

    expect(D).toBeDefined();
  });

  test('settings.hiddenProperties', () => {
    // @ts-expect-error hiddenProperties is not a key of IModelSettings: use settings.properties.hidden
    @model({ settings: { hiddenProperties: ['secret'] } })
    class H extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }

    expect(H).toBeDefined();
  });

  test('skipMigrate', () => {
    // @ts-expect-error skipMigrate is not a key of IModelMetadata: use migration: { use: false }
    @model({ skipMigrate: true })
    class E extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }

    expect(E).toBeDefined();
  });
});

describe('@model - an untyped caller loses the runtime error', () => {
  test.each([
    ['defaultFilter', { settings: { defaultFilter: { where: {} } } }],
    ['defaultLimit', { settings: { defaultLimit: 20 } }],
    ['maxLimit', { settings: { maxLimit: 100 } }],
    ['scopeFilter', { settings: { scopeFilter: { resolve: () => null } } }],
    ['hiddenProperties', { settings: { hiddenProperties: ['secret'] } }],
    ['skipMigrate', { skipMigrate: true }],
  ])('%s is ignored: the decorator neither throws nor applies it', (_key, metadata) => {
    const declare = () => {
      // An `any`-typed or plain-JavaScript caller reaches the decorator without the type error.
      @model(metadata as never)
      class Untyped extends AbstractEntity {
        getSchema<T>(): T {
          return {} as T;
        }
      }

      return Untyped;
    };

    expect(declare).not.toThrow();
    const entry = registry.getModelMetadata({ target: declare() });

    expect(entry?.migration).toBeUndefined();
    expect(entry?.settings?.query).toBeUndefined();
    expect(entry?.settings?.access).toBeUndefined();
    expect(entry?.settings?.properties).toBeUndefined();
  });
});
