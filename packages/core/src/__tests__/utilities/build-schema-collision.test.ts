import { beforeEach, describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { MetadataRegistry } from '@/helpers/inversion';

/** `getModels()` must read straight off the class, never round-trip through the NAME-keyed
 * `modelRegistry`: two `@model` classes resolving to the same key collapse onto one entry, and one
 * datasource silently gets the OTHER's schema and relations at boot, with no error. */
const buildModelClass = (opts: { name: string; schema: unknown }): AnyType => {
  const { name, schema } = opts;

  const modelClass = class {
    static schema = schema;
  };

  Object.defineProperty(modelClass, 'name', { value: name });

  MetadataRegistry.getInstance().registerModel({
    target: modelClass as AnyType,
    metadata: { settings: {} } as AnyType,
  });

  return modelClass;
};

describe('buildSchema - two datasources may own same-named model classes', () => {
  let registry: MetadataRegistry;

  beforeEach(() => {
    registry = MetadataRegistry.getInstance();
  });

  test('each datasource gets ITS OWN schema, not the last-registered same-named one', () => {
    class SchemaAlphaDataSource {}
    class SchemaBetaDataSource {}

    // Same class name in two modules - the single most likely way this happens.
    const alphaOrder = buildModelClass({ name: 'Order', schema: { marker: 'ALPHA' } });
    const betaOrder = buildModelClass({ name: 'Order', schema: { marker: 'BETA' } });

    registry.registerRepositoryBinding({
      repository: class SchemaAlphaOrderRepository {} as AnyType,
      model: alphaOrder,
      dataSource: SchemaAlphaDataSource as AnyType,
    });
    registry.registerRepositoryBinding({
      repository: class SchemaBetaOrderRepository {} as AnyType,
      model: betaOrder,
      dataSource: SchemaBetaDataSource as AnyType,
    });

    const alphaModels = (registry as AnyType).getModels({ dataSource: SchemaAlphaDataSource });
    const betaModels = (registry as AnyType).getModels({ dataSource: SchemaBetaDataSource });

    expect(alphaModels).toHaveLength(1);
    expect(betaModels).toHaveLength(1);

    // The whole point: the schema that comes back must be the one the class actually declared.
    expect(alphaModels[0].schema).toEqual({ marker: 'ALPHA' });
    expect(betaModels[0].schema).toEqual({ marker: 'BETA' });
  });

  test('buildSchema assembles each datasource from its own classes', () => {
    class OnlySchemaAlphaDataSource {}

    const alphaOnly = buildModelClass({ name: 'Invoice', schema: { marker: 'ONLY_ALPHA' } });

    registry.registerRepositoryBinding({
      repository: class SchemaInvoiceRepository {} as AnyType,
      model: alphaOnly,
      dataSource: OnlySchemaAlphaDataSource as AnyType,
    });

    const { schema } = registry.buildSchema({ dataSource: OnlySchemaAlphaDataSource as AnyType });

    expect(schema.Invoice).toEqual({ marker: 'ONLY_ALPHA' });
  });
});
