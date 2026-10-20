import { datasource, model, RelationTypes } from '@venizia/ignis-kernel';
import { createRelations } from '@/relational/core/repositories/dialect/relations/create';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { PGlite } from '@electric-sql/pglite';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';

// A model's settings were looked up by SQL table name, but `@model` registers the class name
// unless TABLE_NAME says otherwise - so a differently named table lost them inside `include`.
const OWNER_TABLE = 'model_name_owner';
const CHILD_TABLE = 'model_name_child';

const ownerTable = pgTable(OWNER_TABLE, {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

const childTable = pgTable(CHILD_TABLE, {
  id: serial('id').primaryKey(),
  ownerId: integer('owner_id').notNull(),
  tenant: text('tenant').notNull(),
  secret: text('secret').notNull(),
});

const ownerRelationsConfig: TRelationConfig[] = [
  {
    name: 'children',
    type: RelationTypes.MANY,
    schema: childTable,
    metadata: { relationName: 'owner' },
  },
];

const childRelationsConfig: TRelationConfig[] = [
  {
    name: 'owner',
    type: RelationTypes.ONE,
    schema: ownerTable,
    metadata: { fields: [childTable.ownerId], references: [ownerTable.id] },
  },
];

// The owner names its table; the child does not.
@model({ type: 'entity' })
class ModelNameOwner extends BasePostgresEntity<typeof ownerTable> {
  static override TABLE_NAME = OWNER_TABLE;
  static override schema = ownerTable;
  static override relations = (): TRelationConfig[] => ownerRelationsConfig;
}

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['secret'],
    scopeFilter: { resolve: () => ({ tenant: 'tenant-a' }) },
  },
})
class ModelNameChild extends BasePostgresEntity<typeof childTable> {
  static override schema = childTable;
  static override relations = (): TRelationConfig[] => childRelationsConfig;
}

@datasource({ driver: PGliteDriver })
class ModelNameDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: ModelNameDataSource.name,
      config: {},
      schema: {
        // Keyed by the registered model name, as auto-discovery keys a real application.
        [OWNER_TABLE]: ownerTable,
        ModelNameChild: childTable,
        ownerRelations: createRelations({ source: ownerTable, relations: ownerRelationsConfig })
          .relations,
        childRelations: createRelations({ source: childTable, relations: childRelationsConfig })
          .relations,
      },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

type TRepository<Schema extends TTableSchemaWithId> = DefaultCRUDRepository<
  Schema,
  TTableObject<Schema>,
  TTableInsert<Schema>,
  IDatabaseExtraOptions,
  ModelNameDataSource
>;

interface IChildRow {
  id: number;
  ownerId: number;
  tenant: string;
  owner?: { id: number; name: string };
}

interface IOwnerRow {
  id: number;
  name: string;
  children?: IChildRow[];
}

let dataSource: ModelNameDataSource;
let ownerRepository: TRepository<typeof ownerTable>;
let childRepository: TRepository<typeof childTable>;

beforeAll(async () => {
  const client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE ${OWNER_TABLE} (id serial primary key, name text not null);
    CREATE TABLE ${CHILD_TABLE} (id serial primary key, owner_id integer not null, tenant text not null, secret text not null);
    INSERT INTO ${OWNER_TABLE} (name) VALUES ('owner');
    INSERT INTO ${CHILD_TABLE} (owner_id, tenant, secret) VALUES (1, 'tenant-a', 's-a'), (1, 'tenant-b', 's-b');
  `);

  dataSource = new ModelNameDataSource({ client });
  ownerRepository = new DefaultCRUDRepository<
    typeof ownerTable,
    TTableObject<typeof ownerTable>,
    TTableInsert<typeof ownerTable>,
    IDatabaseExtraOptions,
    ModelNameDataSource
  >(dataSource, {
    entityClass: ModelNameOwner,
  });
  childRepository = new DefaultCRUDRepository<
    typeof childTable,
    TTableObject<typeof childTable>,
    TTableInsert<typeof childTable>,
    IDatabaseExtraOptions,
    ModelNameDataSource
  >(dataSource, {
    entityClass: ModelNameChild,
  });
});

afterAll(async () => {
  await dataSource.endDriver();
});

describe('model settings reach a relation whose table name is not its class name', () => {
  test('read directly, the child hides `secret` and keeps to its tenant', async () => {
    const rows = await childRepository.find<IChildRow>({ filter: {} });

    expect(rows).toEqual([{ id: 1, ownerId: 1, tenant: 'tenant-a' }]);
  });

  test('included, the child hides `secret` and keeps to its tenant too', async () => {
    const owners = await ownerRepository.find<IOwnerRow>({
      filter: { include: [{ relation: 'children' }] },
    });

    expect(owners).toEqual([
      { id: 1, name: 'owner', children: [{ id: 1, ownerId: 1, tenant: 'tenant-a' }] },
    ]);
  });

  test('the parent finds its own relations', async () => {
    const children = await childRepository.find<IChildRow>({
      filter: { include: [{ relation: 'owner' }] },
    });

    expect(children).toEqual([
      { id: 1, ownerId: 1, tenant: 'tenant-a', owner: { id: 1, name: 'owner' } },
    ]);
  });
});
