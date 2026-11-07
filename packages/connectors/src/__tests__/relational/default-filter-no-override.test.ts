import { PGlite } from '@electric-sql/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model } from '@venizia/ignis-kernel';
import { FilterSchema } from '@venizia/ignis-filter/schemas';
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { RelationsFactory } from '@/relational/core/repositories/dialect/relations/create';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { many, ModelFactory, one, RelationDeclarations } from '@/relational/postgres/models';
import { DefaultCRUDRepository, SoftDeletableRepository } from '@/relational/postgres/repositories';

/**
 * A caller's `where` can only narrow a model's default filter, never replace it: on every read, every write that selects rows,
 * and the `scope.where` of an include. The server opts out with `shouldSkipDefaultFilter`, which the wire schema strips.
 * Runs on PGlite, a real Postgres.
 */

const postTable = pgTable('nof_post', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  deletedAt: timestamp('deleted_at'),
});
const commentTable = pgTable('nof_comment', {
  id: serial('id').primaryKey(),
  postId: integer('post_id')
    .notNull()
    .references((): AnyPgColumn => postTable.id),
  name: text('name').notNull(),
  isDeleted: boolean('is_deleted').notNull(),
});

const PostBase = ModelFactory.defineEntity({
  table: postTable,
  relations: () => ({ comments: many(commentTable, { relationName: 'post' }) }),
});
@model({ type: 'entity', settings: { query: { filter: { where: { deletedAt: null } } } } })
class NofPost extends PostBase {}

const CommentBase = ModelFactory.defineEntity({
  table: commentTable,
  relations: () => ({ post: one(postTable) }),
});
@model({ type: 'entity', settings: { query: { filter: { where: { isDeleted: false } } } } })
class NofComment extends CommentBase {}

const relationsOf = (source: AnyType, entity: AnyType) =>
  RelationsFactory.create({
    source,
    relations: RelationDeclarations.toRelationConfigs({
      relations: entity.relationDefinitions ?? {},
    }),
  }).relations;

@datasource({ driver: PGliteDriver })
class NofDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: NofDataSource.name,
      config: {},
      schema: {
        // The schema keys are the table names the SQL uses.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        nof_post: postTable,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        nof_comment: commentTable,
        postRelations: relationsOf(postTable, PostBase),
        commentRelations: relationsOf(commentTable, CommentBase),
      },
    });
    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }
}

let client: PGlite;
let posts: AnyType;
let comments: AnyType;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE nof_post (id serial primary key, name text not null, deleted_at timestamp);
    CREATE TABLE nof_comment (id serial primary key, post_id integer not null references nof_post(id), name text not null, is_deleted boolean not null);
  `);
  const ds = new NofDataSource({ client });
  posts = new SoftDeletableRepository(ds as AnyType, { entityClass: NofPost as AnyType });
  comments = new DefaultCRUDRepository(ds as AnyType, { entityClass: NofComment as AnyType });
}, 30_000);

beforeEach(async () => {
  await client.exec(`TRUNCATE nof_comment, nof_post RESTART IDENTITY;
    INSERT INTO nof_post (name, deleted_at) VALUES ('live', NULL), ('dead', '2020-01-01');
    INSERT INTO nof_comment (post_id, name, is_deleted) VALUES (1,'c-live',false),(1,'c-dead',true),(2,'c2-live',false);`);
});

const names = (rows: AnyType[]) => rows.map((row) => row.name).sort();

const dbNames = async () => {
  const result = await client.query<{ name: string }>('SELECT name FROM nof_post ORDER BY id');

  return result.rows.map((row) => row.name);
};

/** What a caller might send to reach the row the default hides (`dead`). */
const ATTACKS: Array<[string, AnyType]> = [
  ['not-null operator', { deletedAt: { neq: null } }],
  ['ne null', { deletedAt: { ne: null } }],
  ['not null', { deletedAt: { not: null } }],
  ['not eq null', { deletedAt: { not: { eq: null } } }],
  ['greater than a date', { deletedAt: { gt: '2000-01-01' } }],
  ['between', { deletedAt: { between: ['2000-01-01', '2030-01-01'] } }],
  ['inq', { deletedAt: { inq: ['2020-01-01'] } }],
  ['a date string as a scalar', { deletedAt: '2020-01-01' }],
  ['a Date as a scalar', { deletedAt: new Date('2020-01-01T00:00:00') }],
  ['or with a deleted branch and an empty one', { or: [{ deletedAt: { neq: null } }, {}] }],
  ['or with a deleted branch and a name', { or: [{ deletedAt: { neq: null } }, { name: 'dead' }] }],
  ['and', { and: [{ deletedAt: { neq: null } }] }],
  ['empty and with the operator beside it', { and: [], deletedAt: { neq: null } }],
  ['the name of the row', { name: 'dead' }],
  ['the id of the row', { id: 2 }],
  ['nested or and and', { or: [{ and: [{ deletedAt: { neq: null } }] }] }],
  ['not on the id', { id: { not: { eq: 1 } } }],
];

/** How a call ended. A call may throw for an attack it cannot compile (a date string on a timestamp); then nothing was reached. */
const outcomeOf = async (
  call: () => Promise<AnyType>,
): Promise<{ value: AnyType } | { error: unknown }> => {
  try {
    const result = await call();

    return { value: result };
  } catch (error) {
    return { error };
  }
};

describe('a caller cannot reach the row the default (deletedAt: null) hides', () => {
  test.each(ATTACKS)('reads: %s', async (_name, where) => {
    const found = await outcomeOf(() => posts.find({ filter: { where } }));
    const fields = await outcomeOf(() => posts.find({ filter: { where, fields: ['id', 'name'] } }));
    const ranged = await outcomeOf(() =>
      posts.find({ filter: { where }, options: { shouldQueryRange: true } }),
    );
    const first = await outcomeOf(() => posts.findOne({ filter: { where } }));
    const counted = await outcomeOf(() => posts.count({ where }));
    const exists = await outcomeOf(() =>
      posts.existsWith({ where: { and: [where, { name: 'dead' }] } }),
    );

    if ('value' in found) {
      expect(names(found.value)).not.toContain('dead');
    }

    if ('value' in fields) {
      expect(names(fields.value)).not.toContain('dead');
    }

    if ('value' in ranged) {
      expect(names(ranged.value.data)).not.toContain('dead');
    }

    if ('value' in first) {
      expect(first.value?.name).not.toBe('dead');
    }

    if ('value' in counted) {
      expect(counted.value.count).toBeLessThanOrEqual(1);
    }

    if ('value' in exists) {
      expect(exists.value).toBe(false);
    }
  });

  test.each(ATTACKS)('writes: %s', async (_name, where) => {
    await outcomeOf(() =>
      posts.updateBy({ where, data: { name: 'touched' }, options: { shouldReturn: false } }),
    );
    await outcomeOf(() =>
      posts.updateAll({ where, data: { name: 'touched' }, options: { shouldReturn: false } }),
    );
    await outcomeOf(() => posts.deleteBy({ where, options: { shouldReturn: false } }));
    await outcomeOf(() =>
      posts.deleteBy({ where, options: { shouldReturn: false, shouldHardDelete: true } }),
    );

    // `dead` was neither renamed, nor deleted: no write reached it.
    const result = await dbNames();
    expect(result).toContain('dead');
  });

  test('by id', async () => {
    const result2 = await posts.findById({ id: 2 });
    expect(result2).toBeNull();
    const result3 = await posts.findById({
      id: 2,
      filter: { where: { deletedAt: { neq: null } } },
    });
    expect(result3).toBeNull();
    const result4 = await posts.updateById({ id: 2, data: { name: 'x' } });
    expect(result4.count).toBe(0);
    const result5 = await posts.deleteById({ id: 2, options: { shouldHardDelete: true } });
    expect(result5.count).toBe(0);
  });

  test('restating the default is a no-op, and a legitimate filter still works', async () => {
    const result6 = await posts.find({ filter: { where: { deletedAt: null, name: 'live' } } });
    expect(names(result6)).toEqual(['live']);
    const result7 = await posts.find({ filter: { where: { deletedAt: null, name: 'dead' } } });
    expect(names(result7)).toEqual([]);
    const result8 = await comments.find({ filter: { where: { isDeleted: false } } });
    expect(names(result8)).toEqual(['c-live', 'c2-live']);
    const result9 = await comments.find({ filter: { where: { postId: 1 } } });
    expect(names(result9)).toEqual(['c-live']);
  });

  test('the server opts out with shouldSkipDefaultFilter, and restore works', async () => {
    const deleted = await posts.find({
      filter: { where: { deletedAt: { neq: null } } },
      options: { shouldSkipDefaultFilter: true },
    });

    expect(names(deleted)).toEqual(['dead']);
    const result10 = await posts.restoreBy({ where: { name: 'dead' } });
    expect(result10.count).toBe(1);
  });
});

describe('an include cannot replace the default of the related model', () => {
  test.each([
    ['a scalar', { where: { isDeleted: true } }],
    ['a not-equal operator', { where: { isDeleted: { neq: false } } }],
    ['a not operator', { where: { isDeleted: { not: false } } }],
    ['an or with an empty branch', { where: { or: [{ isDeleted: true }, {}] } }],
    ['an and', { where: { and: [{ isDeleted: true }] } }],
  ])('child scope: %s', async (_name, scope) => {
    const rows = await posts.find({ filter: { include: [{ relation: 'comments', scope }] } });
    const got = rows.flatMap((row: AnyType) => (row.comments ?? []).map((c: AnyType) => c.name));

    expect(got).not.toContain('c-dead');
  });

  test('a belongsTo include of the parent', async () => {
    const viaWhere = await comments.find({
      filter: { include: [{ relation: 'post', scope: { where: { deletedAt: { neq: null } } } }] },
    });

    expect(JSON.stringify(viaWhere)).not.toContain('"dead"');
  });

  test('the wire strips shouldSkipDefaultFilter at every level, a nested include too', () => {
    const wire = {
      where: { deletedAt: { neq: null } },
      shouldSkipDefaultFilter: true,
      include: [
        {
          relation: 'comments',
          shouldSkipDefaultFilter: true,
          scope: {
            shouldSkipDefaultFilter: true,
            include: [{ relation: 'post', shouldSkipDefaultFilter: true }],
          },
        },
      ],
    };

    const parsed = FilterSchema.parse(JSON.parse(JSON.stringify(wire)));

    expect(JSON.stringify(parsed)).not.toContain('shouldSkipDefaultFilter');
  });
});

describe('a key that is not a column is refused', () => {
  const unsafe = (name: string) => JSON.parse(`{"${name}": {"neq": null}}`);

  test.each(['__proto__', 'constructor', 'prototype'])(
    'where key %s is a 400 (Column NOT FOUND) on find, count and the writes',
    async (name) => {
      const where = unsafe(name);
      const calls: Array<() => Promise<unknown>> = [
        () => posts.find({ filter: { where } }),
        () => posts.count({ where }),
        () => posts.updateBy({ where, data: { name: 'x' }, options: { shouldReturn: false } }),
        () => posts.deleteBy({ where, options: { shouldReturn: false } }),
      ];

      for (const call of calls) {
        let failure: AnyType;

        try {
          await call();
        } catch (error) {
          failure = error;
        }

        expect(failure?.message).toContain('Column NOT FOUND');
        expect(failure?.statusCode).toBe(400);
      }

      const result = await dbNames();
      expect(result).toEqual(['live', 'dead']);
    },
  );

  test.each(['__proto__', 'constructor', 'prototype'])(
    'an order or data key %s is refused too',
    async (name) => {
      let ordered: AnyType;
      let updated: AnyType;

      try {
        await posts.find({ filter: { order: [`${name} ASC`] } });
      } catch (error) {
        ordered = error;
      }

      try {
        await posts.updateById({ id: 1, data: JSON.parse(`{"${name}": "x"}`) });
      } catch (error) {
        updated = error;
      }

      expect(ordered?.message).toContain('Column NOT FOUND');
      expect(updated?.message).toContain('Column NOT FOUND');
    },
  );

  test('a nested and, or and include scope refuse the same keys', async () => {
    const where = { and: [{ or: [unsafe('__proto__')] }] };
    let failure: AnyType;

    try {
      await posts.find({ filter: { where } });
    } catch (error) {
      failure = error;
    }

    expect(failure?.message).toContain('Column NOT FOUND');

    let scoped: AnyType;

    try {
      await posts.find({
        filter: { include: [{ relation: 'comments', scope: { where: unsafe('constructor') } }] },
      });
    } catch (error) {
      scoped = error;
    }

    expect(scoped?.message).toContain('Column NOT FOUND');
  });

  test('the parsed wire form of a prototype key does not change what the default allows', async () => {
    const parsed = FilterSchema.parse(
      JSON.parse('{"where": {"__proto__": {"deletedAt": {"neq": null}}}}'),
    );
    let found: string[] = [];

    try {
      const result2 = await posts.find({ filter: parsed });
      found = names(result2);
    } catch (error) {
      expect((error as Error).message).toContain('Column NOT FOUND');
    }

    expect(found).not.toContain('dead');
  });
});
