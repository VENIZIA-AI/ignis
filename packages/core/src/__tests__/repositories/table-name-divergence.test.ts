import { describe, test, expect } from 'bun:test';
import { pgTable, serial, varchar, boolean } from 'drizzle-orm/pg-core';
import { getError } from '@venizia/ignis-helpers';

import { model, repository } from '@/base/metadata';
import { BasePostgresDataSource } from '@/connectors/postgres/datasources';
import { BaseSearchDataSource } from '@/connectors/search/datasources';
import { ISearchConnector } from '@/connectors/search';
import { ISearchDataSourceOptions } from '@/connectors/search/datasources';
import { BasePostgresEntity, TTableInsert, TTableObject } from '@/connectors/postgres/models';
import {
  BaseSearchEntity,
  defineSearchCollection,
  field,
  ISearchCollectionDefinition,
} from '@/connectors/search/models';
import { DefaultCRUDRepository } from '@/connectors/postgres/repositories';
import { ISearchQueryDialect } from '@/connectors/typesense/repositories';
import { ICrudRepository } from '@/base/repositories';
import { TypesenseQueryDialect } from '@/connectors/typesense';
import { MetadataRegistry } from '@/helpers/inversion';

/**
 * `entity.name` (`TABLE_NAME || class name`) can diverge from the model-registry key
 * (`metadata.tableName || TABLE_NAME || class name`); anything keyed off `entity.name` alone
 * silently misses settings registered under a different `tableName`.
 */

const divergedTable = pgTable('diverged_y', {
  id: serial('id').primaryKey(),
  secret: varchar('secret', { length: 255 }),
  isActive: boolean('is_active'),
});

/** No static TABLE_NAME - `entity.name` resolves to the class name ('DivergedEntity'),
 * while `@model({ tableName: 'diverged_y' })` registers it under 'diverged_y'. */
@model({
  type: 'entity',
  tableName: 'diverged_y',
  settings: {
    hiddenProperties: ['secret'],
    defaultFilter: { where: { isActive: true } },
    defaultLimit: 5,
  },
})
class DivergedEntity extends BasePostgresEntity {
  static override schema = divergedTable;
}

const plainTable = pgTable('plain_entities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
});

/** Static TABLE_NAME matches the class's natural identity - no divergence, control case. */
@model({ type: 'entity' })
class PlainEntity extends BasePostgresEntity {
  static override schema = plainTable;
  static override TABLE_NAME = 'PlainEntity';
}

class PostgresDivergedDataSource extends BasePostgresDataSource<{}> {
  configure(): void {
    // no-op: never opens a real connection.
  }

  getConnectionString(): string {
    return '';
  }
}

@repository({ model: DivergedEntity, dataSource: PostgresDivergedDataSource })
class _DivergedRepo {}

@repository({ model: PlainEntity, dataSource: PostgresDivergedDataSource })
class _PlainRepo {}

describe('registry dual-key: registerRepositoryBinding keys by the SAME formula as registerModel', () => {
  test('postgres buildSchema() sees a model whose @model tableName diverges from its class/static name', () => {
    const dataSource = new PostgresDivergedDataSource({ name: 'postgres-diverged-ds', config: {} });
    const schema = dataSource.getSchema();

    // Would be {} if datasourceModels were keyed by class name instead of metadata.tableName.
    expect(schema['diverged_y']).toBe(divergedTable);
  });

  test('getModels() path is unaffected for a plain entity with no tableName divergence', () => {
    const dataSource = new PostgresDivergedDataSource({ name: 'postgres-plain-ds', config: {} });
    const schema = dataSource.getSchema();

    expect(schema['PlainEntity']).toBe(plainTable);
  });

  test('@repository bindings were registered for both fixture repositories', () => {
    const registry = MetadataRegistry.getInstance();

    expect(registry.getRepositoryBinding({ name: _DivergedRepo.name })).toBeDefined();
    expect(registry.getRepositoryBinding({ name: _PlainRepo.name })).toBeDefined();
  });
});

class SearchDivergedDataSource extends BaseSearchDataSource<{}> {
  constructor(opts: ISearchDataSourceOptions<{}>) {
    super(opts);
  }

  configure(): void {
    // no-op fixture.
  }

  getConnector(): ISearchConnector {
    throw getError({
      message: '[SearchDivergedDataSource][getConnector] Not needed for this test',
    });
  }

  getQueryDialect(): ISearchQueryDialect {
    return new TypesenseQueryDialect();
  }

  compileCollection(opts: { definition: ISearchCollectionDefinition }): unknown {
    return opts.definition;
  }

  async ensureCollection(): Promise<void> {}
}

/** BaseSearchEntity's `entity.name` resolves via `COLLECTION_NAME ?? definition.name ?? class
 * name`, which can also diverge from `@model({ tableName })`. */
@model({ type: 'entity', tableName: 'diverged-search-collection' })
class DivergedSearchDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'diverged-search-collection',
    fields: [field.string('title', { searchable: true })],
  });
}

@repository({ model: DivergedSearchDocument, dataSource: SearchDivergedDataSource })
class _DivergedSearchRepo {}

describe('registry dual-key: search-branch discovery sees a diverged tableName model', () => {
  test('getSchema() (getModelClasses -> discoverCollections) sees the collection', () => {
    const dataSource = new SearchDivergedDataSource({ name: 'search-diverged-ds', config: {} });
    const schema = dataSource.getSchema();

    // Same registry-key mismatch as the postgres case above.
    expect(schema['diverged-search-collection']).toBe(DivergedSearchDocument.schema);
  });

  test('@repository binding was registered', () => {
    const registry = MetadataRegistry.getInstance();
    expect(registry.getRepositoryBinding({ name: _DivergedSearchRepo.name })).toBeDefined();
  });
});

@repository({ model: DivergedEntity, dataSource: PostgresDivergedDataSource })
class DivergedCrudRepository extends DefaultCRUDRepository<typeof divergedTable> {}

describe('DefaultCRUDRepository resolves @model settings for a divergent-name entity', () => {
  test('hiddenFields/defaultWhere/defaultLimit resolve through the base class-keyed getters', () => {
    const repo = new DivergedCrudRepository(
      new PostgresDivergedDataSource({ name: 'diverged-crud-ds', config: {} }),
    );

    expect(repo.getEntity().name).toBe('DivergedEntity');
    expect(repo.getHiddenProperties().has('secret')).toBe(true);
    expect(repo.hasHiddenProperties()).toBe(true);
    expect(repo.getDefaultFilter()).toEqual({ where: { isActive: true } });
    expect(repo.hasDefaultFilter()).toBe(true);
    expect(repo.getDefaultLimit()).toBe(5);
  });
});

// Type-level only: fails to compile if DefaultCRUDRepository stops satisfying ICrudRepository.
function assertDefaultCrudSatisfiesICrudRepository(
  repo: DivergedCrudRepository,
): ICrudRepository<TTableObject<typeof divergedTable>, TTableInsert<typeof divergedTable>> {
  return repo;
}

describe('DefaultCRUDRepository satisfies ICrudRepository (type-level, compile-time only)', () => {
  test('assignment compiles - see assertDefaultCrudSatisfiesICrudRepository above', () => {
    const repo = new DivergedCrudRepository(
      new PostgresDivergedDataSource({ name: 'diverged-crud-type-ds', config: {} }),
    );
    expect(assertDefaultCrudSatisfiesICrudRepository(repo)).toBe(repo);
  });
});
