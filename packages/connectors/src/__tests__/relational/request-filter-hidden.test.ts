import { PGlite } from '@electric-sql/pglite';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model } from '@venizia/ignis-kernel';
import { beforeAll, describe, expect, test } from 'bun:test';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
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
  secret: text('secret'),
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
@model({ type: 'entity', settings: { hiddenProperties: ['secret'] } })
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
    CREATE TABLE rfh_post (id serial primary key, name text not null, secret text);
    CREATE TABLE rfh_comment (id serial primary key, post_id integer not null references rfh_post(id), body text not null, internal_note text);
    INSERT INTO rfh_post (name, secret) VALUES ('alpha', 's-1'), ('beta', 's-2');
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

  test('answers like the query answers a column that does not exist: a 400 Column NOT FOUND, without the word hidden', async () => {
    const hidden = refusal(() => posts.assertRequestFilter({ filter: { where: { secret: 1 } } }));
    let missing: AnyType;

    try {
      await posts.find({ filter: { where: { nope: 1 } } });
    } catch (error) {
      missing = error;
    }

    expect(hidden.statusCode).toBe(missing.statusCode);
    expect(hidden.message).toContain('Column NOT FOUND');
    expect(missing.message).toContain('Column NOT FOUND');
    expect(hidden.message).not.toContain('hidden');
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
