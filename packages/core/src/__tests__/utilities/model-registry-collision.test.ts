import { beforeEach, describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { MetadataRegistry } from '@/helpers/inversion';

/** `datasourceModels` must hold model CLASSES: names round-tripped through the name-keyed `modelRegistry` collapse two same-named classes onto one entry, silently resolving the WRONG class (wrong settings, wrong hiddenProperties, empty schema). */
const buildModelClass = (opts: { name: string; hidden: string[] }): AnyType => {
  const { name, hidden } = opts;

  const modelClass = class {
    static schema = { name };
  };

  Object.defineProperty(modelClass, 'name', { value: name });

  const registry = MetadataRegistry.getInstance();
  registry.setModelMetadata({
    target: modelClass,
    metadata: { settings: { hiddenProperties: hidden } } as AnyType,
  });

  return modelClass;
};

describe('MetadataRegistry - two datasources may own same-named model classes', () => {
  let registry: MetadataRegistry;

  beforeEach(() => {
    registry = MetadataRegistry.getInstance();
  });

  test('each datasource resolves ITS OWN model class, not the last one registered', () => {
    class AlphaDataSource {}
    class BetaDataSource {}

    const alphaProduct = buildModelClass({ name: 'CollidingProduct', hidden: ['alphaSecret'] });
    const betaProduct = buildModelClass({ name: 'CollidingProduct', hidden: ['betaSecret'] });

    registry.registerRepositoryBinding({
      repository: class AlphaProductRepository {} as AnyType,
      model: alphaProduct,
      dataSource: AlphaDataSource as AnyType,
    });
    registry.registerRepositoryBinding({
      repository: class BetaProductRepository {} as AnyType,
      model: betaProduct,
      dataSource: BetaDataSource as AnyType,
    });

    const alphaClasses = registry.getModelClasses({ dataSource: AlphaDataSource as AnyType });
    const betaClasses = registry.getModelClasses({ dataSource: BetaDataSource as AnyType });

    expect(alphaClasses).toEqual([alphaProduct]);
    expect(betaClasses).toEqual([betaProduct]);

    // The whole point: the settings that come back must be the ones the class was decorated with.
    const alphaSettings = registry.getModelMetadata({ target: alphaClasses[0] as AnyType });
    const betaSettings = registry.getModelMetadata({ target: betaClasses[0] as AnyType });

    expect(alphaSettings?.settings?.hiddenProperties).toEqual(['alphaSecret']);
    expect(betaSettings?.settings?.hiddenProperties).toEqual(['betaSecret']);
  });

  test('hasModels reflects the datasource that actually owns models', () => {
    class OwnerDataSource {}
    class EmptyDataSource {}

    registry.registerRepositoryBinding({
      repository: class OwnedRepository {} as AnyType,
      model: buildModelClass({ name: 'OwnedDocument', hidden: [] }),
      dataSource: OwnerDataSource as AnyType,
    });

    expect(registry.hasModels({ dataSource: OwnerDataSource as AnyType })).toBe(true);
    expect(registry.hasModels({ dataSource: EmptyDataSource as AnyType })).toBe(false);
  });
});
