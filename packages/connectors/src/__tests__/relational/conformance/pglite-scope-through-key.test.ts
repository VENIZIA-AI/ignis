import { PGlite } from '@electric-sql/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model, ScopeThrough, type TScopeOperation } from '@venizia/ignis-kernel';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { RelationsFactory } from '@/relational/core/repositories/dialect/relations/create';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { many, ModelFactory, one, RelationDeclarations } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';

/**
 * A child that points at a parent column which is NOT unique (`code` repeats across merchants): the write check
 * must count distinct keys, not rows, or one key matching two parent rows hides a key that matches none. Also: a
 * parent that reads wide and writes narrow governs a child's writes by its write scope.
 */
const PARENT_TABLE = 'through_key_parent';
const CHILD_TABLE = 'through_key_child';

const parentTable = pgTable(PARENT_TABLE, {
  id: serial('id').primaryKey(),
  code: text('code').notNull(),
  merchantId: text('merchant_id').notNull(),
});

const childTable = pgTable(CHILD_TABLE, {
  id: serial('id').primaryKey(),
  parentCode: text('parent_code').notNull(),
  name: text('name').notNull(),
});

/** The scope the parent resolves for reads, and for every other operation. */
let readScope: string[] = [];
let writeScope: string[] = [];

const ParentBase = ModelFactory.defineEntity({
  table: parentTable,
  relations: () => ({ children: many(childTable, { relationName: 'parent' }) }),
});

@model({
  type: 'entity',
  settings: {
    access: {
      resolve: ({ operation }: { operation: TScopeOperation }) => {
        return { merchantId: { inq: operation === 'read' ? readScope : writeScope } };
      },
    },
  },
})
class Parent extends ParentBase {}

const ChildBase = ModelFactory.defineEntity({
  table: childTable,
  relations: () => ({
    parent: one(parentTable, { fields: [childTable.parentCode], references: [parentTable.code] }),
  }),
});

@model({
  type: 'entity',
  settings: {
    access: { through: ScopeThrough.of({ entity: ChildBase, relation: 'parent' }) },
  },
})
class Child extends ChildBase {}

const relationsOf = (opts: {
  source: typeof parentTable | typeof childTable;
  entity: {
    relationDefinitions:
      | Parameters<typeof RelationDeclarations.toRelationConfigs>[0]['relations']
      | undefined;
  };
}) => {
  return RelationsFactory.create({
    source: opts.source,
    relations: RelationDeclarations.toRelationConfigs({
      relations: opts.entity.relationDefinitions ?? {},
    }),
  }).relations;
};

@datasource({ driver: PGliteDriver })
class KeyDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: KeyDataSource.name,
      config: {},
      schema: {
        [PARENT_TABLE]: parentTable,
        [CHILD_TABLE]: childTable,
        parentRelations: relationsOf({ source: parentTable, entity: ParentBase }),
        childRelations: relationsOf({ source: childTable, entity: ChildBase }),
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

let client: PGlite;
let dataSource: KeyDataSource;
let parents: DefaultCRUDRepository<typeof parentTable>;
let children: DefaultCRUDRepository<typeof childTable>;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE ${PARENT_TABLE} (id serial primary key, code text not null, merchant_id text not null);
    CREATE TABLE ${CHILD_TABLE} (id serial primary key, parent_code text not null, name text not null);
  `);

  dataSource = new KeyDataSource({ client });
  parents = new DefaultCRUDRepository<typeof parentTable>(dataSource as AnyType, {
    entityClass: Parent as AnyType,
  });
  children = new DefaultCRUDRepository<typeof childTable>(dataSource as AnyType, {
    entityClass: Child as AnyType,
  });
});

afterAll(async () => {
  await dataSource.endDriver();
});

/** Code A exists in m1 and in m2, B only in m3, C only in m2. */
beforeEach(async () => {
  readScope = ['m1', 'm2'];
  writeScope = ['m1', 'm2'];
  await client.exec(`
    TRUNCATE ${CHILD_TABLE}, ${PARENT_TABLE} RESTART IDENTITY;
    INSERT INTO ${PARENT_TABLE} (code, merchant_id) VALUES ('A', 'm1'), ('A', 'm2'), ('B', 'm3'), ('C', 'm2');
  `);
});

const refusal = async (write: () => Promise<unknown>): Promise<string> => {
  try {
    await write();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  return '';
};

const childNames = async (): Promise<string[]> => {
  const { rows } = await client.query<{ name: string }>(
    `SELECT name FROM ${CHILD_TABLE} ORDER BY id`,
  );

  return rows.map((row) => row.name);
};

describe('a parent column that is not unique', () => {
  test('a key that matches two parent rows does not hide a key that matches none', async () => {
    // A matches two rows (m1 and m2), B matches none in scope: two rows come back for two keys.
    const message = await refusal(() =>
      children.createAll({
        data: [
          { parentCode: 'A', name: 'a' },
          { parentCode: 'B', name: 'b' },
        ],
      }),
    );
    const written = await childNames();

    expect(message).toContain('write refused by the access scope');
    expect(written).toEqual([]);
  });

  test('a key that matches two parent rows is written once the other keys are in scope too', async () => {
    await children.createAll({
      data: [
        { parentCode: 'A', name: 'a' },
        { parentCode: 'C', name: 'c' },
      ],
    });
    const written = await childNames();

    expect(written).toEqual(['a', 'c']);
  });
});

describe('a parent that reads wide and writes narrow', () => {
  test('the parent itself reads by its read scope', async () => {
    writeScope = ['m1'];
    const listed = await parents.find({ filter: {} });

    expect(listed.map((row) => row.merchantId).sort()).toEqual(['m1', 'm2', 'm2']);
  });

  test('the write scope governs the child writes, the read scope its reads', async () => {
    writeScope = ['m1'];
    await client.exec(`INSERT INTO ${CHILD_TABLE} (parent_code, name) VALUES ('C', 'existing')`);

    const read = await children.find({ filter: {} });
    const refused = await refusal(() => children.create({ data: { parentCode: 'C', name: 'x' } }));
    await children.create({ data: { parentCode: 'A', name: 'ok' } });
    const written = await childNames();

    expect(read.map((row) => row.name)).toEqual(['existing']);
    expect(refused).toContain('write refused by the access scope');
    expect(written).toEqual(['existing', 'ok']);
  });
});
