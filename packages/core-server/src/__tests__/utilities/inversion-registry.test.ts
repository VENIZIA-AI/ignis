import { describe, expect, test } from 'bun:test';
import {
  AbstractEntity,
  Container,
  type IDataSource,
  MetadataRegistry,
} from '@venizia/ignis-kernel';

/** The registry is a PROCESS-WIDE singleton shared with every other test file, so nothing here calls clearAll() and every fixture carries a name no other suite uses. */
const registry = MetadataRegistry.getInstance();

/** Only its class is registered (never built): `getSchema` hands back the static `schema` the registry also reads. */
class RegistryTestEntity extends AbstractEntity {
  constructor() {
    super({ name: new.target.name });
  }

  getSchema<T = unknown>(): T {
    return Reflect.get(this.constructor, 'schema');
  }
}

class RegistryTestAlphaEntity extends RegistryTestEntity {
  static schema = { name: 'registry_test_alpha' };
}

class RegistryTestBetaEntity extends RegistryTestEntity {
  static TABLE_NAME = 'registry_test_beta_table';
  static schema = { name: 'registry_test_beta' };
}

class RegistryTestAlphaRepository {}
class RegistryTestBetaRepository {}
/** Only its class is registered (never built), so it carries just enough to satisfy `IDataSource`. */
class RegistryTestDataSource implements IDataSource {
  name = 'RegistryTestDataSource';
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

class RegistryTestAlphaDataSource extends RegistryTestDataSource {}
class RegistryTestBetaDataSource extends RegistryTestDataSource {}

describe('core Container - metadata registry', () => {
  test('getMetadataRegistry() hands back the one core singleton, per container', () => {
    const first = new Container({ scope: 'RegistryTestFirst' });
    const second = new Container({ scope: 'RegistryTestSecond' });

    expect(first.getMetadataRegistry()).toBe(MetadataRegistry.getInstance());
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
      target: RegistryTestAlphaEntity,
      metadata: { type: 'entity', tableName: 'registry_test_alpha' },
    });

    const entry = registry.getModelEntry({ name: 'registry_test_alpha' });

    expect(entry).toBeDefined();
    expect(entry?.schema).toBe(RegistryTestAlphaEntity.schema);
    expect(registry.getModelMetadata({ target: RegistryTestAlphaEntity })?.type).toBe('entity');
  });

  test('a static TABLE_NAME is honoured when no tableName is given', () => {
    registry.registerModel({
      target: RegistryTestBetaEntity,
      metadata: { type: 'entity' },
    });

    expect(registry.getModelEntry({ name: 'registry_test_beta_table' })).toBeDefined();
  });

  test('authorize principals are only reported for models that declare one', () => {
    registry.registerModel({
      target: RegistryTestAlphaEntity,
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
      target: RegistryTestAlphaEntity,
      metadata: { type: 'entity', tableName: 'registry_test_alpha' },
    });

    registry.registerRepositoryBinding({
      repository: RegistryTestAlphaRepository,
      model: RegistryTestAlphaEntity,
      dataSource: RegistryTestAlphaDataSource,
    });

    expect(registry.getRepositoryBinding({ name: 'RegistryTestAlphaRepository' })).toBeDefined();
    expect(
      registry.getModels({ dataSource: RegistryTestAlphaDataSource }).map((model) => {
        return model.tableName;
      }),
    ).toEqual(['registry_test_alpha']);
    expect(registry.hasModels({ dataSource: RegistryTestAlphaDataSource })).toBe(true);
  });

  test('a binding registered with LAZY resolvers is discoverable too', () => {
    registry.registerModel({
      target: RegistryTestBetaEntity,
      metadata: { type: 'entity' },
    });

    // IRepositoryBinding declares every member as TValueOrResolver - a resolver is the documented way out of a circular import, and it must key the datasource by the RESOLVED class name.
    registry.registerRepositoryBinding({
      repository: () => RegistryTestBetaRepository,
      model: () => RegistryTestBetaEntity,
      dataSource: () => RegistryTestBetaDataSource,
    });

    expect(registry.getRepositoryBinding({ name: 'RegistryTestBetaRepository' })).toBeDefined();
    expect(
      registry.getModels({ dataSource: RegistryTestBetaDataSource }).map((model) => {
        return model.tableName;
      }),
    ).toEqual(['registry_test_beta_table']);
    expect(registry.hasModels({ dataSource: RegistryTestBetaDataSource })).toBe(true);
  });

  test('a string datasource key is passed through untouched', () => {
    registry.registerModel({
      target: RegistryTestAlphaEntity,
      metadata: { type: 'entity', tableName: 'registry_test_alpha' },
    });

    registry.registerRepositoryBinding({
      repository: RegistryTestAlphaRepository,
      model: RegistryTestAlphaEntity,
      dataSource: 'RegistryTestStringDataSource',
    });

    expect(registry.hasModels({ dataSource: 'RegistryTestStringDataSource' })).toBe(true);
  });

  test('buildSchema keys the schema by table name and stays empty for an unknown datasource', () => {
    registry.registerModel({
      target: RegistryTestAlphaEntity,
      metadata: { type: 'entity', tableName: 'registry_test_alpha' },
    });

    registry.registerRepositoryBinding({
      repository: RegistryTestAlphaRepository,
      model: RegistryTestAlphaEntity,
      dataSource: RegistryTestAlphaDataSource,
    });

    const built = registry.buildSchema({ dataSource: RegistryTestAlphaDataSource });
    expect(built.schema['registry_test_alpha']).toBe(RegistryTestAlphaEntity.schema);
    expect(built.relations).toEqual({});

    class RegistryTestUnknownDataSource extends RegistryTestDataSource {}
    expect(registry.getModels({ dataSource: RegistryTestUnknownDataSource })).toEqual([]);
    expect(registry.hasModels({ dataSource: RegistryTestUnknownDataSource })).toBe(false);
    expect(registry.buildSchema({ dataSource: RegistryTestUnknownDataSource })).toEqual({
      schema: {},
      relations: {},
    });
  });

  test('getModelClasses resolves the model targets for a datasource', () => {
    registry.registerModel({
      target: RegistryTestAlphaEntity,
      metadata: { type: 'entity', tableName: 'registry_test_alpha' },
    });

    registry.registerRepositoryBinding({
      repository: RegistryTestAlphaRepository,
      model: () => RegistryTestAlphaEntity,
      dataSource: RegistryTestAlphaDataSource,
    });

    expect(registry.getModelClasses({ dataSource: RegistryTestAlphaDataSource })).toEqual([
      RegistryTestAlphaEntity,
    ]);
  });
});
