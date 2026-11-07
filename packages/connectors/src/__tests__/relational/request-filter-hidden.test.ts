import { PGlite } from '@electric-sql/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model } from '@venizia/ignis-kernel';
import { beforeAll, describe, expect, test } from 'bun:test';
import { integer, jsonb, pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { RelationsFactory } from '@/relational/core/repositories/dialect/relations/create';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { many, ModelFactory, one, RelationDeclarations } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';

/**
 * A filter that comes from a request cannot name a field its model hides: the repository answers `assertRequestFilter`, the generated
 * controllers call it. The repository's own verbs are not held to it, so server code can still filter and sort on a hidden field.
 */

const postTable = pgTable('rfh_post', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  secret: text('secret_col'),
  meta: jsonb('meta'),
});
const commentTable = pgTable('rfh_comment', {
  id: serial('id').primaryKey(),
  postId: integer('post_id')
    .notNull()
    .references((): AnyPgColumn => postTable.id),
  body: text('body').notNull(),
  internalNote: text('internal_note'),
});

const PostBase = ModelFactory.defineEntity({
  table: postTable,
  relations: () => ({ comments: many(commentTable, { relationName: 'post' }) }),
});
@model({ type: 'entity', settings: { hiddenProperties: ['secret', 'meta'] } })
class RfhPost extends PostBase {}

const CommentBase = ModelFactory.defineEntity({
  table: commentTable,
  relations: () => ({ post: one(postTable) }),
});
@model({ type: 'entity', settings: { hiddenProperties: ['internalNote'] } })
class RfhComment extends CommentBase {}

const relationsOf = (source: AnyType, entity: AnyType) =>
  RelationsFactory.create({
    source,
    relations: RelationDeclarations.toRelationConfigs({
      relations: entity.relationDefinitions ?? {},
    }),
  }).relations;

@datasource({ driver: PGliteDriver })
class RfhDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: RfhDataSource.name,
      config: {},
      schema: {
        // The schema keys are the table names the SQL uses.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        rfh_post: postTable,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        rfh_comment: commentTable,
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

let posts: AnyType;
let comments: AnyType;

beforeAll(async () => {
  const client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE rfh_post (id serial primary key, name text not null, secret_col text, meta jsonb);
    CREATE TABLE rfh_comment (id serial primary key, post_id integer not null references rfh_post(id), body text not null, internal_note text);
    INSERT INTO rfh_post (name, secret_col, meta) VALUES ('alpha', 's-1', '{"pin":"1111"}'), ('beta', 's-2', '{"pin":"9999"}');
    INSERT INTO rfh_comment (post_id, body, internal_note) VALUES (1, 'c1', 'n-1'), (1, 'c2', 'n-2'), (2, 'c3', 'n-3');
  `);
  const ds = new RfhDataSource({ client });
  posts = new DefaultCRUDRepository(ds as AnyType, { entityClass: RfhPost as AnyType });
  comments = new DefaultCRUDRepository(ds as AnyType, { entityClass: RfhComment as AnyType });
}, 30_000);

const refusal = (task: () => void): AnyType => {
  try {
    task();
  } catch (error) {
    return error;
  }

  throw new Error('expected a refusal');
};

describe('the request filter of a model that hides `secret`', () => {
  test.each([
    ['where', { where: { secret: 's-1' } }],
    ['where operator', { where: { secret: { like: 's-%' } } }],
    ['where in an or', { where: { or: [{ name: 'alpha' }, { secret: 's-2' }] } }],
    ['where in a nested and', { where: { and: [{ and: [{ secret: 's-1' }] }] } }],
    ['where JSON path', { where: { 'secret.path': 1 } }],
    ['order', { order: ['secret DESC'] }],
    ['order JSON path', { order: ['secret.path ASC'] }],
  ])('refuses %s with a 400 Column NOT FOUND', (_name, filter) => {
    const error = refusal(() => posts.assertRequestFilter({ filter }));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('Column NOT FOUND');
  });

  test.each([
    ['a hidden JSON column, as [meta].pin', { where: { '[meta].pin': '1111' } }],
    ['a hidden JSON column, as .meta.pin', { where: { '.meta.pin': '1111' } }],
    ['a hidden JSON column, as [meta]pin', { where: { '[meta]pin': '9999' } }],
    ['a hidden JSON column, as meta.pin', { where: { 'meta.pin': '9999' } }],
    ['a hidden JSON column in an or', { where: { or: [{ '.meta.pin': '9999' }] } }],
    ['a hidden text column read as a path', { where: { '.secret': 's-1' } }],
    ['a hidden text column read as brackets', { where: { '[secret].x': 'a' } }],
    ['an order on a hidden JSON column, as [meta].pin', { order: ['[meta].pin DESC'] }],
    ['an order on a hidden JSON column, as .meta.pin', { order: ['.meta.pin ASC'] }],
    ['an order on a hidden JSON column, as meta.pin', { order: ['meta.pin ASC'] }],
  ])('refuses %s', (_name, filter) => {
    expect(refusal(() => posts.assertRequestFilter({ filter })).statusCode).toBe(400);
  });

  test("a column's database name is not a property: the guard leaves it, and the query refuses it as an unknown column", async () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the database name of the column, which is not a property
    const filter = { where: { secret_col: 's-1' } };
    let error: AnyType;

    expect(() => posts.assertRequestFilter({ filter })).not.toThrow();

    try {
      await posts.find({ filter });
    } catch (caught) {
      error = caught;
    }

    expect(error.message).toContain('Column NOT FOUND');
  });

  /** The refusal of a hidden field is the very text the query gives for a column that does not exist: nothing tells them apart. */
  describe('byte for byte the error of a column that does not exist', () => {
    const queryError = async (filter: object): Promise<AnyType> => {
      try {
        await posts.find({ filter });
      } catch (error) {
        return error;
      }

      throw new Error('the query accepted a column that does not exist');
    };

    const renamed = (filter: object, from: string, to: string): object =>
      JSON.parse(JSON.stringify(filter).replaceAll(from, to));

    test.each([
      ['where, plain', 'secret', { where: { secret: 's-1' } }],
      ['where, in a nested and and or', 'secret', { where: { and: [{ or: [{ secret: 1 }] }] } }],
      ['where, [meta].pin', 'meta', { where: { '[meta].pin': '1111' } }],
      ['where, .meta.pin', 'meta', { where: { '.meta.pin': '1111' } }],
      ['where, [meta]pin', 'meta', { where: { '[meta]pin': '1111' } }],
      ['where, meta.pin', 'meta', { where: { 'meta.pin': '1111' } }],
      ['where, .secret on a text column', 'secret', { where: { '.secret': 's-1' } }],
      ['where, [secret].x on a text column', 'secret', { where: { '[secret].x': 's-1' } }],
      ['order, plain', 'secret', { order: ['secret DESC'] }],
      ['order, [meta].pin', 'meta', { order: ['[meta].pin DESC'] }],
      ['order, .meta.pin', 'meta', { order: ['.meta.pin ASC'] }],
      ['order, meta.pin', 'meta', { order: ['meta.pin ASC'] }],
    ])('%s', async (_name, hiddenName, filter) => {
      const hidden = refusal(() => posts.assertRequestFilter({ filter }));
      const missing = await queryError(renamed(filter, hiddenName, 'nope'));

      expect(hidden.statusCode).toBe(missing.statusCode);
      expect(hidden.message).toBe(missing.message.replaceAll('nope', hiddenName));
      expect(hidden.message).toContain('Column NOT FOUND');
      expect(hidden.message).not.toContain('hidden');
    });

    test("an include scope's refusal is the related table's own error", async () => {
      const hidden = refusal(() =>
        posts.assertRequestFilter({
          filter: { include: [{ relation: 'comments', scope: { where: { internalNote: 'x' } } }] },
        }),
      );
      let missing: AnyType;

      try {
        await posts.find({
          filter: { include: [{ relation: 'comments', scope: { where: { nope: 'x' } } }] },
        });
      } catch (error) {
        missing = error;
      }

      expect(hidden.message).toBe(missing.message.replaceAll('nope', 'internalNote'));
    });
  });

  test('passes a filter on visible fields', () => {
    expect(() =>
      posts.assertRequestFilter({
        filter: {
          where: { name: 'alpha', or: [{ id: 1 }] },
          order: ['name ASC'],
          fields: ['id', 'name'],
        },
      }),
    ).not.toThrow();
  });
});

/**
 * A filter that names a hidden field and something else the query refuses is answered with the first refusal the query meets,
 * as the same filter with a missing name in place of the hidden one is. The core API (no include, no fields) reads where, then
 * order; the query API reads order, then where, then each include in turn, its scope the same way.
 */
describe('the first refusal in the order the query reads the filter', () => {
  const queryError = async (opts: { filter: object; isCount?: boolean }): Promise<AnyType> => {
    try {
      if (opts.isCount) {
        await posts.count({ where: (opts.filter as AnyType).where });
      } else {
        await posts.find({ filter: opts.filter });
      }
    } catch (error) {
      return error;
    }

    throw new Error('the query accepted the filter');
  };

  const renamed = (filter: object, from: string, to: string): object =>
    JSON.parse(JSON.stringify(filter).replaceAll(from, to));

  /** Each filter names a hidden field and `nope`; the control puts the missing `zzz` in place of the hidden name. */
  test.each([
    [
      'a missing where key before the hidden one',
      'secret',
      'nope',
      { where: { nope: 1, secret: 1 } },
    ],
    [
      'the hidden where key before a missing one',
      'secret',
      'zzz',
      { where: { secret: 1, nope: 1 } },
    ],
    [
      'a missing key in an or before the hidden one',
      'secret',
      'nope',
      { where: { or: [{ nope: 1 }], secret: 1 } },
    ],
    [
      'a missing key before a hidden JSON path',
      'meta',
      'nope',
      { where: { nope: 1, '.meta.pin': '1111' } },
    ],
    [
      'a JSON path on a visible text column before the hidden one',
      'secret',
      'not a JSON column',
      { where: { 'name.x': 1, secret: 1 } },
    ],
    [
      'a missing order entry before the hidden one',
      'secret',
      'nope',
      { order: ['nope ASC', 'secret DESC'] },
    ],
    [
      'core API: the where is read before the order',
      'secret',
      'nope',
      { where: { nope: 1 }, order: ['secret DESC'] },
    ],
    [
      'core API: a hidden where key before a missing order entry',
      'secret',
      'zzz',
      { where: { secret: 1 }, order: ['nope ASC'] },
    ],
    [
      'query API: the order is read before the where',
      'secret',
      'nope',
      { fields: ['id', 'name'], where: { secret: 1 }, order: ['nope ASC'] },
    ],
    [
      'query API: the where is read before an include scope',
      'internalNote',
      'nope',
      {
        where: { nope: 1 },
        include: [{ relation: 'comments', scope: { where: { internalNote: 'x' } } }],
      },
    ],
    [
      'an include scope reads its order before its where',
      'internalNote',
      'nope',
      {
        include: [
          { relation: 'comments', scope: { where: { internalNote: 'x' }, order: ['nope ASC'] } },
        ],
      },
    ],
    [
      'an unknown relation before a known one whose scope names a hidden field',
      'internalNote',
      'Relation NOT FOUND',
      {
        include: [
          { relation: 'nope' },
          { relation: 'comments', scope: { where: { internalNote: 'x' } } },
        ],
      },
    ],
  ])('%s', async (_name, hiddenName, named, filter) => {
    const hidden = refusal(() => posts.assertRequestFilter({ filter }));
    const missing = await queryError({ filter: renamed(filter, hiddenName, 'zzz') });

    expect(missing.message).toContain(named);
    expect(hidden.statusCode).toBe(missing.statusCode);
    expect(hidden.message).toBe(missing.message.replaceAll('zzz', hiddenName));
  });

  test('count reads the where alone: a missing key before the hidden one is named', async () => {
    const filter = { where: { nope: 1, secret: 1 } };
    const hidden = refusal(() => posts.assertRequestFilter({ filter }));
    const missing = await queryError({ filter: renamed(filter, 'secret', 'zzz'), isCount: true });

    expect(missing.message).toContain('nope');
    expect(hidden.message).toBe(missing.message);
  });

  test('a filter with a missing name and no hidden one is left to the query', () => {
    expect(() =>
      posts.assertRequestFilter({ filter: { where: { nope: 1 }, order: ['zzz ASC'] } }),
    ).not.toThrow();
  });
});

describe('an include scope is judged by the model it reads', () => {
  test("the related model's hidden field is refused in the scope's where and order", () => {
    const where = refusal(() =>
      posts.assertRequestFilter({
        filter: { include: [{ relation: 'comments', scope: { where: { internalNote: 'n-1' } } }] },
      }),
    );
    const order = refusal(() =>
      posts.assertRequestFilter({
        filter: { include: [{ relation: 'comments', scope: { order: ['internalNote ASC'] } }] },
      }),
    );

    expect(where.statusCode).toBe(400);
    expect(order.statusCode).toBe(400);
  });

  test("the parent's hidden field is not the child's: a child field of the same name as the parent's is judged by the child", () => {
    expect(() =>
      posts.assertRequestFilter({
        filter: {
          include: [{ relation: 'comments', scope: { where: { body: 'c1', secret: 'x' } } }],
        },
      }),
    ).not.toThrow();
  });

  test('a belongsTo include is judged by the parent model it reads', () => {
    const error = refusal(() =>
      comments.assertRequestFilter({
        filter: { include: [{ relation: 'post', scope: { where: { secret: 's-1' } } }] },
      }),
    );

    expect(error.statusCode).toBe(400);
  });

  test('a nested include is judged by its own model', () => {
    const error = refusal(() =>
      posts.assertRequestFilter({
        filter: {
          include: [
            {
              relation: 'comments',
              scope: { include: [{ relation: 'post', scope: { where: { secret: 's-1' } } }] },
            },
          ],
        },
      }),
    );

    expect(error.statusCode).toBe(400);
  });

  test('an unknown relation and an include with no scope are not refused here', () => {
    expect(() =>
      posts.assertRequestFilter({
        filter: { include: ['comments', { relation: 'nope', scope: { where: { secret: 1 } } }] },
      }),
    ).not.toThrow();
  });
});

describe('server code is not held to it', () => {
  test('find, count and an order on a hidden field work on the repository', async () => {
    const found = await posts.find({ filter: { where: { secret: 's-2' } } });
    const counted = await posts.count({ where: { secret: { like: 's-%' } } });
    const ordered = await posts.find({ filter: { order: ['secret DESC'] } });

    expect(found.map((row: AnyType) => row.name)).toEqual(['beta']);
    expect(counted.count).toBe(2);
    expect(ordered.map((row: AnyType) => row.name)).toEqual(['beta', 'alpha']);
  });

  test('an include scope on a hidden field of the child works on the repository, and the field is not returned', async () => {
    const rows = await posts.find({
      filter: { include: [{ relation: 'comments', scope: { where: { internalNote: 'n-1' } } }] },
    });
    const first = rows.find((row: AnyType) => row.name === 'alpha');

    expect(first.comments).toHaveLength(1);
    expect(first.comments[0].body).toBe('c1');
    expect(JSON.stringify(rows)).not.toContain('n-1');
    expect(JSON.stringify(rows)).not.toContain('s-1');
  });
});
