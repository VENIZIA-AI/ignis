import { model } from '@/base/metadata';
import { ModelMetadataUtility } from '@/base/metadata/model-metadata';
import { AbstractEntity, ModelTypes } from '@/base/models';
import { MetadataRegistry } from '@/helpers/inversion';
import type { IModelMetadata } from '@/helpers/inversion';
import { afterEach, describe, expect, test } from 'bun:test';

const registry = MetadataRegistry.getInstance();

afterEach(() => {
  registry.getAllModels().clear();
});

let sequence = 0;

/** A fresh class each call, with its own table name: the registry keys models by it. */
const declare = (metadata?: IModelMetadata) => {
  sequence += 1;

  @model({ ...metadata, tableName: `probe_${sequence}` })
  class Probe extends AbstractEntity {
    getSchema<T>(): T {
      return {} as T;
    }
  }

  return Probe;
};

const normalize = (metadata: IModelMetadata) =>
  ModelMetadataUtility.normalizeModelMetadata({ model: 'Probe', metadata });

describe('ModelTypes', () => {
  test('is shaped like RepositoryTypes: a value, a set and isValid', () => {
    expect(ModelTypes.ENTITY).toBe('entity');
    expect(ModelTypes.SCHEME_SET.has('entity')).toBe(true);
    expect(ModelTypes.isValid('entity')).toBe(true);
    expect(ModelTypes.isValid('view')).toBe(false);
    expect(ModelTypes.isValid('')).toBe(false);
  });
});

describe('@model - type', () => {
  test('may be left out, and @model() takes no argument at all', () => {
    expect(() => declare({})).not.toThrow();
    expect(() => {
      @model()
      class Bare extends AbstractEntity {
        getSchema<T>(): T {
          return {} as T;
        }
      }

      return Bare;
    }).not.toThrow();
  });

  test('accepts ModelTypes.ENTITY', () => {
    expect(() => declare({ type: ModelTypes.ENTITY })).not.toThrow();
  });

  test.each(['view', 'table', ''])('refuses %p at decoration, listing the valid values', (type) => {
    expect(() => declare({ type: type as never })).toThrow(/Invalid 'type'.*entity/);
  });
});

describe('normalizeModelMetadata - migration', () => {
  test('neither set: the metadata comes back untouched', () => {
    const metadata: IModelMetadata = { type: ModelTypes.ENTITY };

    expect(normalize(metadata)).toBe(metadata);
    expect('skipMigrate' in normalize(metadata)).toBe(false);
  });

  test('migration alone: use defaults to true and no other field is added', () => {
    const empty = normalize({ migration: {} });
    const off = normalize({ migration: { use: false } });
    const on = normalize({ migration: { use: true } });

    expect(empty.migration).toEqual({ use: true });
    expect(off.migration).toEqual({ use: false });
    expect(on.migration).toEqual({ use: true });
    expect('skipMigrate' in empty).toBe(false);
    expect('skipMigrate' in off).toBe(false);
  });

  test('the other metadata is carried through', () => {
    const result = normalize({
      migration: { use: false },
      tableName: 'Item',
      settings: { hiddenProperties: ['a'] },
    });

    expect(result.tableName).toBe('Item');
    expect(result.settings).toEqual({ hiddenProperties: ['a'] });
  });
});

describe('@model - what the public registry holds', () => {
  test('a migration model: the entry carries migration and no skipMigrate', () => {
    const New = declare({ migration: { use: false } });
    const entry = registry.getModelMetadata({ target: New });

    expect(entry?.migration?.use).toBe(false);
    expect(entry && 'skipMigrate' in entry).toBe(false);
  });

  test('a model that says nothing: no migration field', () => {
    const Plain = declare({ type: ModelTypes.ENTITY });
    const entry = registry.getModelMetadata({ target: Plain });

    expect(entry?.migration).toBeUndefined();
  });

  test('a consumer can build its migration list from the registry', () => {
    declare({ migration: { use: false } });
    declare({});
    declare({ migration: { use: true } });

    const migrated = [...registry.getAllModels().values()].filter(
      (entry) => entry.metadata?.migration?.use !== false,
    );

    expect(migrated).toHaveLength(2);
  });
});
