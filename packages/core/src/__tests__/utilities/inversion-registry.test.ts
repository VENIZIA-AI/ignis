import { describe, expect, test } from 'bun:test';
import { Container, MetadataRegistry } from '@/helpers/inversion';
import type { AnyType } from '@venizia/ignis-helpers/common';

/** The registry is a PROCESS-WIDE singleton shared with every other test file, so nothing here calls clearAll() and every fixture carries a name no other suite uses. */
const registry = MetadataRegistry.getInstance();

class RegistryTestAlphaEntity {
  static schema = { name: 'registry_test_alpha' };
}

class RegistryTestBetaEntity {
  static TABLE_NAME = 'registry_test_beta_table';
  static schema = { name: 'registry_test_beta' };
}

class RegistryTestAlphaRepository {}
class RegistryTestBetaRepository {}
class RegistryTestAlphaDataSource {}
class RegistryTestBetaDataSource {}

describe('core Container - metadata registry', () => {
  test('getMetadataRegistry() hands back the one core singleton, per container', () => {
    const first = new Container({ scope: 'RegistryTestFirst' });
    const second = new Container({ scope: 'RegistryTestSecond' });

    expect(first.getMetadataRegistry()).toBe(MetadataRegistry.getInstance() as AnyType);
    expect(first.getMetadataRegistry()).toBe(second.getMetadataRegistry());
  });

  test('the core registry carries the core mixins, not just inversion primitives', () => {
    const instance = MetadataRegistry.getInstance();

    expect(typeof instance.registerModel).toBe('function');
    expect(typeof instance.registerRepositoryBinding).toBe('function');
    expect(typeof instance.buildSchema).toBe('function');
    expect(typeof instance.getInjectMetadata).toBe('function');
  });
});

describe('ModelMetadataMixin', () => {
  test('an explicit tableName wins over the class name', () => {
    registry.registerModel({
      target: RegistryTestAlphaEntity as AnyType,
      metadata: { type: 'entity', tableName: 'registry_test_alpha' },
    });

    const entry = registry.getModelEntry({ name: 'registry_test_alpha' });

    expect(entry).toBeDefined();
    expect(entry?.schema).toBe(RegistryTestAlphaEntity.schema);
    expect(registry.getModelMetadata({ target: RegistryTestAlphaEntity })?.type).toBe('entity');
  });

  test('a static TABLE_NAME is honoured when no tableName is given', () => {
    registry.registerModel({
      target: RegistryTestBetaEntity as AnyType,
      metadata: { type: 'entity' },
    });

    expect(registry.getModelEntry({ name: 'registry_test_beta_table' })).toBeDefined();
  });

  test('authorize principals are only reported for models that declare one', () => {
    registry.registerModel({
      target: RegistryTestAlphaEntity as AnyType,
      metadata: {
        type: 'entity',
        tableName: 'registry_test_alpha',
        settings: { authorize: { principal: 'RegistryTestAlpha' } },
      },
    });

    const principals = registry.getAuthorizeModelPrincipals({ format: 'array' });
    const record = registry.getAuthorizeModelPrincipals({ format: 'record' });

    expect(principals).toContain('RegistryTestAlpha');
    expect(record['registry_test_alpha']).toBe('RegistryTestAlpha');
  });
});

describe('RepositoryMetadataMixin', () => {
  test('a binding registered with plain classes is discoverable', () => {
    registry.registerModel({
      target: RegistryTestAlphaEntity as AnyType,
      metadata: { type: 'entity', tableName: 'registry_test_alpha' },
    });

    registry.registerRepositoryBinding({
      repository: RegistryTestAlphaRepository as AnyType,
      model: RegistryTestAlphaEntity as AnyType,
      dataSource: RegistryTestAlphaDataSource as AnyType,
    });

    expect(registry.getRepositoryBinding({ name: 'RegistryTestAlphaRepository' })).toBeDefined();
    expect(
      registry.getModels({ dataSource: RegistryTestAlphaDataSource as AnyType }).map(model => {
        return model.tableName;
      }),
    ).toEqual(['registry_test_alpha']);
    expect(registry.hasModels({ dataSource: RegistryTestAlphaDataSource as AnyType })).toBe(true);
  });

  test('a binding registered with LAZY resolvers is discoverable too', () => {
    registry.registerModel({
      target: RegistryTestBetaEntity as AnyType,
      metadata: { type: 'entity' },
    });

    // IRepositoryBinding declares every member as TValueOrResolver - a resolver is the documented way out of a circular import, and it must key the datasource by the RESOLVED class name.
    registry.registerRepositoryBinding({
      repository: (() => RegistryTestBetaRepository) as AnyType,
      model: (() => RegistryTestBetaEntity) as AnyType,
      dataSource: (() => RegistryTestBetaDataSource) as AnyType,
    });

    expect(registry.getRepositoryBinding({ name: 'RegistryTestBetaRepository' })).toBeDefined();
    expect(
      registry.getModels({ dataSource: RegistryTestBetaDataSource as AnyType }).map(model => {
        return model.tableName;
      }),
    ).toEqual(['registry_test_beta_table']);
    expect(registry.hasModels({ dataSource: RegistryTestBetaDataSource as AnyType })).toBe(true);
  });

  test('a string datasource key is passed through untouched', () => {
    registry.registerModel({
      target: RegistryTestAlphaEntity as AnyType,
      metadata: { type: 'entity', tableName: 'registry_test_alpha' },
    });

    registry.registerRepositoryBinding({
      repository: RegistryTestAlphaRepository as AnyType,
      model: RegistryTestAlphaEntity as AnyType,
      dataSource: 'RegistryTestStringDataSource' as AnyType,
    });

    expect(registry.hasModels({ dataSource: 'RegistryTestStringDataSource' })).toBe(true);
  });

  test('buildSchema keys the schema by table name and stays empty for an unknown datasource', () => {
    registry.registerModel({
      target: RegistryTestAlphaEntity as AnyType,
      metadata: { type: 'entity', tableName: 'registry_test_alpha' },
    });

    registry.registerRepositoryBinding({
      repository: RegistryTestAlphaRepository as AnyType,
      model: RegistryTestAlphaEntity as AnyType,
      dataSource: RegistryTestAlphaDataSource as AnyType,
    });

    const built = registry.buildSchema({ dataSource: RegistryTestAlphaDataSource as AnyType });
    expect(built.schema['registry_test_alpha']).toBe(RegistryTestAlphaEntity.schema);
    expect(built.relations).toEqual({});

    class RegistryTestUnknownDataSource {}
    expect(registry.getModels({ dataSource: RegistryTestUnknownDataSource as AnyType })).toEqual(
      [],
    );
    expect(registry.hasModels({ dataSource: RegistryTestUnknownDataSource as AnyType })).toBe(
      false,
    );
    expect(registry.buildSchema({ dataSource: RegistryTestUnknownDataSource as AnyType })).toEqual({
      schema: {},
      relations: {},
    });
  });

  test('getModelClasses resolves the model targets for a datasource', () => {
    registry.registerModel({
      target: RegistryTestAlphaEntity as AnyType,
      metadata: { type: 'entity', tableName: 'registry_test_alpha' },
    });

    registry.registerRepositoryBinding({
      repository: RegistryTestAlphaRepository as AnyType,
      model: (() => RegistryTestAlphaEntity) as AnyType,
      dataSource: RegistryTestAlphaDataSource as AnyType,
    });

    expect(
      registry.getModelClasses({ dataSource: RegistryTestAlphaDataSource as AnyType }),
    ).toEqual([RegistryTestAlphaEntity as AnyType]);
  });
});
