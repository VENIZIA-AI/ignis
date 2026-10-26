import { warnDeprecatedModelMetadata } from '@/base/applications/deprecations';
import { model } from '@/base/metadata';
import { normalizeModelMetadata } from '@/base/metadata/model-metadata';
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
  normalizeModelMetadata({ model: 'Probe', metadata });

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

describe('normalizeModelMetadata - migration and skipMigrate', () => {
  test('neither set: the metadata comes back untouched', () => {
    const metadata: IModelMetadata = { type: ModelTypes.ENTITY };

    expect(normalize(metadata)).toBe(metadata);
    expect('skipMigrate' in normalize(metadata)).toBe(false);
  });

  test('skipMigrate: true becomes migration.use false, and the registry shows both', () => {
    const result = normalize({ skipMigrate: true });

    expect(result.migration).toEqual({ use: false });
    expect(result.skipMigrate).toBe(true);
    expect(result.deprecatedMetadata).toEqual([
      { key: 'skipMigrate', use: 'migration: { use: false }' },
    ]);
  });

  test('skipMigrate: false becomes migration.use true and a derived skipMigrate false', () => {
    const result = normalize({ skipMigrate: false });

    expect(result.migration).toEqual({ use: true });
    expect(result.skipMigrate).toBe(false);
    expect(result.deprecatedMetadata).toHaveLength(1);
  });

  test('migration alone: use defaults to true, skipMigrate is derived and nothing is deprecated', () => {
    const empty = normalize({ migration: {} });
    const off = normalize({ migration: { use: false } });
    const on = normalize({ migration: { use: true } });

    expect(empty.migration).toEqual({ use: true });
    expect(empty.skipMigrate).toBe(false);
    expect(off.skipMigrate).toBe(true);
    expect(on.skipMigrate).toBe(false);
    expect(empty.deprecatedMetadata).toBeUndefined();
    expect(off.deprecatedMetadata).toBeUndefined();
  });

  test('both set is an error naming the model and the key to keep', () => {
    expect(() => normalize({ skipMigrate: true, migration: { use: false } })).toThrow(
      /\[model\]\[Probe\] skipMigrate and migration are both set.*keep migration/,
    );
  });

  test('the other metadata is carried through', () => {
    const result = normalize({
      skipMigrate: true,
      tableName: 'Item',
      settings: { hiddenProperties: ['a'] },
    });

    expect(result.tableName).toBe('Item');
    expect(result.settings).toEqual({ hiddenProperties: ['a'] });
  });
});

describe('@model - what the public registry holds', () => {
  test('an old skipMigrate model: both fields, so consumer tooling reading either keeps working', () => {
    const Old = declare({ skipMigrate: true });
    const entry = registry.getModelMetadata({ target: Old });

    expect(entry?.skipMigrate).toBe(true);
    expect(entry?.migration?.use).toBe(false);
  });

  test('a new migration model: both fields too', () => {
    const New = declare({ migration: { use: false } });
    const entry = registry.getModelMetadata({ target: New });

    expect(entry?.skipMigrate).toBe(true);
    expect(entry?.migration?.use).toBe(false);
  });

  test('a model that says nothing: no migration field and no skipMigrate, as before', () => {
    const Plain = declare({ type: ModelTypes.ENTITY });
    const entry = registry.getModelMetadata({ target: Plain });

    expect(entry?.migration).toBeUndefined();
    expect(entry?.skipMigrate).toBeUndefined();
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

describe('warnDeprecatedModelMetadata', () => {
  const collect = () => {
    const lines: string[] = [];
    const logger = {
      warn: (template: string, ...args: unknown[]) => {
        lines.push(args.reduce<string>((text, arg) => text.replace('%s', String(arg)), template));
      },
    };

    return { lines, logger };
  };

  test('prints one warning for a skipMigrate model, naming the model, the key, the new key and 0.4.5', () => {
    class WarnedProduct extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }
    model({ skipMigrate: true })(WarnedProduct);
    const { lines, logger } = collect();

    expect(warnDeprecatedModelMetadata({ logger: logger as never })).toBe(1);
    expect(lines).toEqual([
      '[deprecated] model WarnedProduct uses skipMigrate | use migration: { use: false } instead | removed in 0.4.5',
    ]);
  });

  test('skipMigrate: false names migration: { use: true }, not use: false', () => {
    class KeptProduct extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }
    model({ skipMigrate: false })(KeptProduct);
    const { lines, logger } = collect();

    expect(warnDeprecatedModelMetadata({ logger: logger as never })).toBe(1);
    expect(lines).toEqual([
      '[deprecated] model KeptProduct uses skipMigrate | use migration: { use: true } (or no key, true is the default) instead | removed in 0.4.5',
    ]);
  });

  test('prints nothing for models on the new key or with none', () => {
    declare({ migration: { use: false } });
    declare({});
    const { lines, logger } = collect();

    expect(warnDeprecatedModelMetadata({ logger: logger as never })).toBe(0);
    expect(lines).toEqual([]);
  });
});
