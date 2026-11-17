import { beforeEach, describe, expect, test } from 'bun:test';
import { AbstractEntity, type IDataSource, MetadataRegistry } from '@venizia/ignis-kernel';

/** Only its class is registered (never built), so it carries just enough to satisfy `IDataSource`. */
class CollisionTestDataSource implements IDataSource {
  name = 'CollisionTestDataSource';
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

/** `datasourceModels` must hold model CLASSES: names round-tripped through the name-keyed `modelRegistry` collapse two same-named classes onto one entry, silently resolving the WRONG class (wrong settings, wrong hidden properties, empty schema). */
const buildModelClass = (opts: { name: string; hidden: string[] }) => {
  const { name, hidden } = opts;

  const modelClass = class extends AbstractEntity {
    static schema = { name };

    constructor() {
      super({ name });
    }

    getSchema<T = unknown>(): T {
      return Reflect.get(this.constructor, 'schema');
    }
  };

  Object.defineProperty(modelClass, 'name', { value: name });

  const registry = MetadataRegistry.getInstance();
  registry.setModelMetadata({
    target: modelClass,
    metadata: { settings: { properties: { hidden } } },
  });

  return modelClass;
};

describe('MetadataRegistry - two datasources may own same-named model classes', () => {
  let registry: MetadataRegistry;

  beforeEach(() => {
    registry = MetadataRegistry.getInstance();
  });

  test('each datasource resolves ITS OWN model class, not the last one registered', () => {
    class AlphaDataSource extends CollisionTestDataSource {}
    class BetaDataSource extends CollisionTestDataSource {}

    const alphaProduct = buildModelClass({ name: 'CollidingProduct', hidden: ['alphaSecret'] });
    const betaProduct = buildModelClass({ name: 'CollidingProduct', hidden: ['betaSecret'] });

    registry.registerRepositoryBinding({
      repository: class AlphaProductRepository {},
      model: alphaProduct,
      dataSource: AlphaDataSource,
    });
    registry.registerRepositoryBinding({
      repository: class BetaProductRepository {},
      model: betaProduct,
      dataSource: BetaDataSource,
    });

    const alphaClasses = registry.getModelClasses({ dataSource: AlphaDataSource });
    const betaClasses = registry.getModelClasses({ dataSource: BetaDataSource });

    expect(alphaClasses).toEqual([alphaProduct]);
    expect(betaClasses).toEqual([betaProduct]);

    // The whole point: the settings that come back must be the ones the class was decorated with.
    const alphaSettings = registry.getModelMetadata({ target: alphaClasses[0] });
    const betaSettings = registry.getModelMetadata({ target: betaClasses[0] });

    expect(alphaSettings?.settings?.properties?.hidden).toEqual(['alphaSecret']);
    expect(betaSettings?.settings?.properties?.hidden).toEqual(['betaSecret']);
  });

  test('hasModels reflects the datasource that actually owns models', () => {
    class OwnerDataSource extends CollisionTestDataSource {}
    class EmptyDataSource extends CollisionTestDataSource {}

    registry.registerRepositoryBinding({
      repository: class OwnedRepository {},
      model: buildModelClass({ name: 'OwnedDocument', hidden: [] }),
      dataSource: OwnerDataSource,
    });

    expect(registry.hasModels({ dataSource: OwnerDataSource })).toBe(true);
    expect(registry.hasModels({ dataSource: EmptyDataSource })).toBe(false);
  });
});
