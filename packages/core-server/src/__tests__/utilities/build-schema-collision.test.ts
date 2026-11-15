import { beforeEach, describe, expect, test } from 'bun:test';
import { AbstractEntity, type IDataSource, MetadataRegistry } from '@venizia/ignis-kernel';

/** Only its class is registered (never built), so it carries just enough to satisfy `IDataSource`. */
class SchemaTestDataSource implements IDataSource {
  name = 'SchemaTestDataSource';
  settings = {};
  schema = {};

  getSettings() {
    return this.settings;
  }

  getSchema() {
    return this.schema;
  }

  configure() {}
}

/** `getModels()` must read straight off the class, never round-trip through the NAME-keyed `modelRegistry`: two `@model` classes resolving to the same key collapse onto one entry, and one datasource silently gets the OTHER's schema and relations at boot, with no error. */
const buildModelClass = (opts: { name: string; schema: unknown }) => {
  const { name, schema } = opts;

  const modelClass = class extends AbstractEntity {
    static schema = schema;

    constructor() {
      super({ name });
    }

    getSchema<T = unknown>(): T {
      return Reflect.get(this.constructor, 'schema');
    }
  };

  Object.defineProperty(modelClass, 'name', { value: name });

  MetadataRegistry.getInstance().registerModel({
    target: modelClass,
    metadata: { settings: {} },
  });

  return modelClass;
};

describe('buildSchema - two datasources may own same-named model classes', () => {
  let registry: MetadataRegistry;

  beforeEach(() => {
    registry = MetadataRegistry.getInstance();
  });

  test('each datasource gets ITS OWN schema, not the last-registered same-named one', () => {
    class SchemaAlphaDataSource extends SchemaTestDataSource {}
    class SchemaBetaDataSource extends SchemaTestDataSource {}

    // Same class name in two modules - the single most likely way this happens.
    const alphaOrder = buildModelClass({ name: 'Order', schema: { marker: 'ALPHA' } });
    const betaOrder = buildModelClass({ name: 'Order', schema: { marker: 'BETA' } });

    registry.registerRepositoryBinding({
      repository: class SchemaAlphaOrderRepository {},
      model: alphaOrder,
      dataSource: SchemaAlphaDataSource,
    });
    registry.registerRepositoryBinding({
      repository: class SchemaBetaOrderRepository {},
      model: betaOrder,
      dataSource: SchemaBetaDataSource,
    });

    const alphaModels = registry.getModels({ dataSource: SchemaAlphaDataSource });
    const betaModels = registry.getModels({ dataSource: SchemaBetaDataSource });

    expect(alphaModels).toHaveLength(1);
    expect(betaModels).toHaveLength(1);

    // The whole point: the schema that comes back must be the one the class actually declared.
    expect(alphaModels[0].schema).toEqual({ marker: 'ALPHA' });
    expect(betaModels[0].schema).toEqual({ marker: 'BETA' });
  });

  test('buildSchema assembles each datasource from its own classes', () => {
    class OnlySchemaAlphaDataSource extends SchemaTestDataSource {}

    const alphaOnly = buildModelClass({ name: 'Invoice', schema: { marker: 'ONLY_ALPHA' } });

    registry.registerRepositoryBinding({
      repository: class SchemaInvoiceRepository {},
      model: alphaOnly,
      dataSource: OnlySchemaAlphaDataSource,
    });

    const { schema } = registry.buildSchema({ dataSource: OnlySchemaAlphaDataSource });

    expect(schema.Invoice).toEqual({ marker: 'ONLY_ALPHA' });
  });
});
