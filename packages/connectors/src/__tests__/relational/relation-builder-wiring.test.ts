import { describe, expect, test } from 'bun:test';
import { Relations } from 'drizzle-orm';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { RelationTypes } from '@venizia/ignis-kernel';
// Imported as a VALUE, not a type: the module body of `connectors/relational/datasources/base.ts`
// installs the concrete relation builder (`RelationBuilderRegistry.set({ builder: RelationsFactory.create })`)
// as a side effect of that module loading. Referencing `BaseRelationalDataSource` below - and only
// this reference - is what guarantees the install has run before `buildSchema()` is exercised. A
// later "unused import" cleanup that deletes this import would silently disable this test's guard.
import { BaseRelationalDataSource } from '@/relational/core';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { BasePostgresEntity } from '@/relational/postgres/models';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import { MetadataRegistry } from '@venizia/ignis-kernel';

const parentTable = pgTable('relation_wiring_parent', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }),
});

const childTable = pgTable('relation_wiring_child', {
  id: serial('id').primaryKey(),
  label: varchar('label', { length: 50 }),
});

const relationsConfig: Array<TRelationConfig> = [
  { name: 'child', type: RelationTypes.ONE, schema: childTable, metadata: undefined },
];

class RelationWiringParentEntity extends BasePostgresEntity<typeof parentTable> {
  static override schema = parentTable;
  static override relations = () => relationsConfig;
}

class RelationWiringParentRepository {}
class RelationWiringParentDataSource extends BasePostgresDataSource {
  override configure(): void {}

  override getConnectionString(): string {
    return 'postgresql://relation-wiring';
  }
}

/**
 * The wiring this test protects: `RepositoryMetadataMixin.resolveModelRelations()` never imports
 * `drizzle-orm` itself - it calls whatever `RelationBuilderRegistry.resolve()` returns. The concrete
 * builder (`RelationsFactory.create`) is installed only by loading `connectors/relational/datasources/base.ts`.
 * Every existing test that reaches `buildSchema()`/`getModels()` exercises the zero-relations case
 * and asserts `relations: {}`, so none of them would notice if that install line were ever lost -
 * this is the one that does.
 */
describe('relation builder wiring - registry-driven relation building end-to-end', () => {
  test('buildSchema() resolves a declared relation through the installed builder', () => {
    // Forces this module's reference to be real (see the import comment above), and confirms the
    // datasource-base module - the one that installs the builder - has actually loaded.
    expect(typeof BaseRelationalDataSource).toBe('function');

    const registry = MetadataRegistry.getInstance();

    registry.registerModel({
      target: RelationWiringParentEntity,
      metadata: { type: 'entity', tableName: 'relation_wiring_parent' },
    });

    registry.registerRepositoryBinding({
      repository: RelationWiringParentRepository,
      model: RelationWiringParentEntity,
      dataSource: RelationWiringParentDataSource,
    });

    const built = registry.buildSchema({
      dataSource: RelationWiringParentDataSource,
    });

    // 1. Relations were actually produced, not the empty-case default every other test asserts.
    expect(Object.keys(built.relations).length).toBeGreaterThan(0);

    // 2. Keyed the way buildSchema() documents: `${tableName}Relations`.
    const builtRelations = built.relations['relation_wiring_parentRelations'];
    expect(builtRelations).toBeDefined();

    // 3. Structural, not a passthrough: only `RelationsFactory.create()` calling drizzle-orm's own
    // `relations()` produces an actual `Relations` instance wrapping the source table. A stub that
    // echoed back the raw `TRelationConfig` array (or `{ relations: opts.relations }`) would be a
    // plain object/array here and fail both checks below.
    expect(builtRelations).toBeInstanceOf(Relations);
    expect(builtRelations instanceof Relations ? builtRelations.table : undefined).toBe(
      parentTable,
    );
  });
});
