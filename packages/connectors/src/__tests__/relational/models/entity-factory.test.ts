import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { datasource, model, repository, RelationTypes } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { ILogger } from '@venizia/ignis-helpers/core';
import { PGlite } from '@electric-sql/pglite';
import { createTableRelationsHelpers, getTableName, is, One } from 'drizzle-orm';
import { pgTable, text } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { createRelations } from '@/relational/core/repositories/dialect/relations/create';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import {
  generateIdColumnDefs,
  many,
  ModelFactory,
  one,
  toRelationConfigs,
} from '@/relational/postgres/models';
import type { TEntityObject } from '@/relational/postgres/models';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const stringId = () => generateIdColumnDefs({ id: { dataType: 'string' } });

// ----- Tables first: plain drizzle, foreign keys stated once, on the column.

const PolicyTable = pgTable('EntityPolicy', {
  ...stringId(),
  title: text('title').notNull(),
  secret: text('secret'),
});

const PolicyDetailTable = pgTable('EntityPolicyDetail', {
  ...stringId(),
  policyId: text('policy_id')
    .notNull()
    .references((): AnyPgColumn => PolicyTable.id),
  note: text('note').notNull(),
});

const PolicyFeatureTable = pgTable('EntityPolicyFeature', {
  ...stringId(),
  policyId: text('policy_id')
    .notNull()
    .references((): AnyPgColumn => PolicyTable.id),
  parentId: text('parent_id').references((): AnyPgColumn => PolicyFeatureTable.id),
  code: text('code').notNull(),
});

// A linked list: each row keys the row before it.
const NodeTable = pgTable('EntityNode', {
  ...stringId(),
  previousId: text('previous_id').references((): AnyPgColumn => NodeTable.id),
  label: text('label').notNull(),
});

// Two keys to one table: a written relation claims one, so the other is left to read.
const WriterTable = pgTable('EntityWriter', {
  ...stringId(),
  name: text('name').notNull(),
});

const ArticleTable = pgTable('EntityArticle', {
  ...stringId(),
  authorId: text('author_id').references((): AnyPgColumn => WriterTable.id),
  editorId: text('editor_id').references((): AnyPgColumn => WriterTable.id),
  title: text('title').notNull(),
});

// ----- Entities: each relation points at a table, so two entities never import each other.

let policyRelationCalls = 0;

@model({ type: 'entity', settings: { hiddenProperties: ['secret'] } })
class EntityPolicy extends ModelFactory.defineEntity({
  table: PolicyTable,
  relations: () => {
    policyRelationCalls += 1;
    return {
      features: many(PolicyFeatureTable, { relationName: 'policy' }),
      // The inverse side of a one-to-one: the foreign key lives on the detail table.
      detail: one(PolicyDetailTable),
    };
  },
}) {}

@model({ type: 'entity' })
class EntityPolicyFeature extends ModelFactory.defineEntity({
  table: PolicyFeatureTable,
  relations: () => ({
    // No fields: read off the table's one foreign key to the target.
    policy: one(PolicyTable),
    parent: one(PolicyFeatureTable),
    children: many(PolicyFeatureTable, { relationName: 'parent' }),
  }),
}) {}

@model({ type: 'entity' })
class EntityPolicyDetail extends ModelFactory.defineEntity({
  table: PolicyDetailTable,
  relations: () => ({ policy: one(PolicyTable) }),
}) {}

@model({ type: 'entity' })
class EntityNode extends ModelFactory.defineEntity({
  table: NodeTable,
  relations: () => ({
    previous: one(NodeTable),
    // The key is on the next row, so this side writes it out, reversed.
    next: one(NodeTable, { fields: [NodeTable.id], references: [NodeTable.previousId] }),
  }),
}) {}

@model({ type: 'entity' })
class EntityWriter extends ModelFactory.defineEntity({ table: WriterTable }) {}

@model({ type: 'entity' })
class EntityArticle extends ModelFactory.defineEntity({
  table: ArticleTable,
  relations: () => ({
    author: one(WriterTable, { fields: [ArticleTable.authorId], references: [WriterTable.id] }),
    // author_id is claimed above, so editor_id is the one key left.
    editor: one(WriterTable),
  }),
}) {}

type TPolicy = TEntityObject<typeof EntityPolicy>;
type TPolicyFeature = TEntityObject<typeof EntityPolicyFeature>;
type TNode = TEntityObject<typeof EntityNode>;
type TArticle = TEntityObject<typeof EntityArticle>;

// ----- A datasource that discovers its models, as an application's does.

let client: PGlite;

@datasource({ driver: PGliteDriver })
class EntityFactoryDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor() {
    super({ name: EntityFactoryDataSource.name, config: {} });
    this.client = client;
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

/** A repository over one of this file's PGlite datasources. */
class PGliteRepository<
  Schema extends TTableSchemaWithId,
  DataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> = EntityFactoryDataSource,
> extends DefaultCRUDRepository<
  Schema,
  TTableObject<Schema>,
  TTableInsert<Schema>,
  IDatabaseExtraOptions,
  DataSource
> {}

@repository({ model: EntityPolicy, dataSource: EntityFactoryDataSource })
class PolicyRepository extends PGliteRepository<typeof PolicyTable> {}

@repository({ model: EntityPolicyFeature, dataSource: EntityFactoryDataSource })
class PolicyFeatureRepository extends PGliteRepository<typeof PolicyFeatureTable> {}

@repository({ model: EntityPolicyDetail, dataSource: EntityFactoryDataSource })
class PolicyDetailRepository extends PGliteRepository<typeof PolicyDetailTable> {}

@repository({ model: EntityNode, dataSource: EntityFactoryDataSource })
class NodeRepository extends PGliteRepository<typeof NodeTable> {}

@repository({ model: EntityWriter, dataSource: EntityFactoryDataSource })
class WriterRepository extends PGliteRepository<typeof WriterTable> {}

@repository({ model: EntityArticle, dataSource: EntityFactoryDataSource })
class ArticleRepository extends PGliteRepository<typeof ArticleTable> {}

// ----- A second datasource whose inverse one() nothing pairs: the profile declares no one() back.

const OrphanUserTable = pgTable('EntityOrphanUser', { ...stringId() });

const OrphanProfileTable = pgTable('EntityOrphanProfile', {
  ...stringId(),
  userId: text('user_id').references((): AnyPgColumn => OrphanUserTable.id),
});

@model({ type: 'entity' })
class EntityOrphanUser extends ModelFactory.defineEntity({
  table: OrphanUserTable,
  relations: () => ({ profile: one(OrphanProfileTable) }),
}) {}

@model({ type: 'entity' })
class EntityOrphanProfile extends ModelFactory.defineEntity({ table: OrphanProfileTable }) {}

@datasource({ driver: PGliteDriver })
class OrphanDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor() {
    super({ name: OrphanDataSource.name, config: {} });
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }
}

@repository({ model: EntityOrphanUser, dataSource: OrphanDataSource })
class OrphanUserRepository extends PGliteRepository<typeof OrphanUserTable, OrphanDataSource> {}

@repository({ model: EntityOrphanProfile, dataSource: OrphanDataSource })
class OrphanProfileRepository extends PGliteRepository<
  typeof OrphanProfileTable,
  OrphanDataSource
> {}

// ----- A third datasource whose many() nothing pairs: the post declares no one() back.

const LoneAuthorTable = pgTable('EntityLoneAuthor', { ...stringId() });

const LonePostTable = pgTable('EntityLonePost', {
  ...stringId(),
  authorId: text('author_id').references((): AnyPgColumn => LoneAuthorTable.id),
});

@model({ type: 'entity' })
class EntityLoneAuthor extends ModelFactory.defineEntity({
  table: LoneAuthorTable,
  relations: () => ({ posts: many(LonePostTable) }),
}) {}

@model({ type: 'entity' })
class EntityLonePost extends ModelFactory.defineEntity({ table: LonePostTable }) {}

@datasource({ driver: PGliteDriver })
class LoneDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor() {
    super({ name: LoneDataSource.name, config: {} });
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }
}

@repository({ model: EntityLoneAuthor, dataSource: LoneDataSource })
class LoneAuthorRepository extends PGliteRepository<typeof LoneAuthorTable, LoneDataSource> {}

@repository({ model: EntityLonePost, dataSource: LoneDataSource })
class LonePostRepository extends PGliteRepository<typeof LonePostTable, LoneDataSource> {}

// ----- A fourth datasource whose many() targets a table no model on it uses.

const StrayOwnerTable = pgTable('EntityStrayOwner', { ...stringId() });

const StrayItemTable = pgTable('EntityStrayItem', {
  ...stringId(),
  ownerId: text('owner_id').references((): AnyPgColumn => StrayOwnerTable.id),
});

@model({ type: 'entity' })
class EntityStrayOwner extends ModelFactory.defineEntity({
  table: StrayOwnerTable,
  relations: () => ({ items: many(StrayItemTable) }),
}) {}

@datasource({ driver: PGliteDriver })
class StrayDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor() {
    super({ name: StrayDataSource.name, config: {} });
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }
}

@repository({ model: EntityStrayOwner, dataSource: StrayDataSource })
class StrayOwnerRepository extends PGliteRepository<typeof StrayOwnerTable, StrayDataSource> {}

describe('ModelFactory.defineEntity - the class', () => {
  test('takes TABLE_NAME from the table, so the name is stated once', () => {
    expect(EntityPolicy.TABLE_NAME).toBe('EntityPolicy');
    expect(getTableName(EntityPolicy.schema)).toBe('EntityPolicy');
    expect(new EntityPolicy().name).toBe('EntityPolicy');
  });

  test('does not run the relations thunk when the class is defined', () => {
    // A thunk run at definition would throw for any table declared later in the file.
    expect(policyRelationCalls).toBe(0);
  });

  test('runs the thunk once, however many times the relations are read', () => {
    const resolve = EntityPolicy.relations;
    const first = typeof resolve === 'function' ? resolve() : resolve;
    const second = typeof resolve === 'function' ? resolve() : resolve;

    expect(first).toBe(second);
    expect(Object.keys(EntityPolicy.relationDefinitions ?? {})).toEqual(['features', 'detail']);
    expect(policyRelationCalls).toBe(1);
  });

  test('flattens the keyed relations into the array form, named by their keys', () => {
    expect(toRelationConfigs({ relations: { children: many(PolicyFeatureTable) } })).toEqual([
      {
        name: 'children',
        type: RelationTypes.MANY,
        schema: PolicyFeatureTable,
        metadata: undefined,
      },
    ]);
  });

  test('the instance reports its id type and builds its zod schemas', () => {
    const entity = new EntityPolicy();

    expect(entity.getIdType()).toBe('string');
    expect(entity.getSchema({ type: 'create' })).toBeDefined();
    expect(entity.getSchema({ type: 'select' })).toBeDefined();
  });
});

/** Runs the relation callback the way drizzle does when it builds the query schema. */
const buildRelations = (opts: Parameters<typeof createRelations>[0]) =>
  createRelations(opts).relations.config(createTableRelationsHelpers(opts.source));

describe('one() reads its columns off the table', () => {
  test('a single foreign key to the target becomes fields and references', () => {
    const built = buildRelations({
      source: PolicyFeatureTable,
      relations: toRelationConfigs({ relations: { policy: one(PolicyTable) } }),
    });

    const policy = built.policy;
    expect(is(policy, One) ? policy.config?.fields : undefined).toEqual([
      PolicyFeatureTable.policyId,
    ]);
    expect(is(policy, One) ? policy.config?.references : undefined).toEqual([PolicyTable.id]);
  });

  test('fields written out are used as written', () => {
    const built = buildRelations({
      source: PolicyFeatureTable,
      relations: toRelationConfigs({
        relations: {
          policy: one(PolicyTable, {
            fields: [PolicyFeatureTable.policyId],
            references: [PolicyTable.id],
            relationName: 'owner',
          }),
        },
      }),
    });

    expect(built.policy.relationName).toBe('owner');
  });

  test('the inverse side of a one-to-one carries no config, so drizzle pairs it from the other side', () => {
    const built = buildRelations({
      source: PolicyTable,
      relations: toRelationConfigs({ relations: { detail: one(PolicyDetailTable) } }),
    });

    const detail = built.detail;
    expect(is(detail, One)).toBe(true);
    expect(is(detail, One) ? detail.config : 'not a one').toBeUndefined();
  });

  test('two foreign keys to the same table are refused, naming the columns', () => {
    const UserTable = pgTable('EntityUser', { ...stringId() });
    const AuditTable = pgTable('EntityAudit', {
      ...stringId(),
      createdBy: text('created_by').references((): AnyPgColumn => UserTable.id),
      updatedBy: text('updated_by').references((): AnyPgColumn => UserTable.id),
    });

    expect(() =>
      buildRelations({
        source: AuditTable,
        relations: toRelationConfigs({ relations: { creator: one(UserTable) } }),
      }),
    ).toThrow(/created_by, updated_by/);
  });

  test('a key claimed by a written one() is left out, so the one key left is read', () => {
    const built = buildRelations({
      source: ArticleTable,
      relations: toRelationConfigs({
        relations: {
          author: one(WriterTable, {
            fields: [ArticleTable.authorId],
            references: [WriterTable.id],
          }),
          editor: one(WriterTable),
        },
      }),
    });

    const editor = built.editor;
    expect(is(editor, One) ? editor.config?.fields : undefined).toEqual([ArticleTable.editorId]);
    expect(is(editor, One) ? editor.config?.references : undefined).toEqual([WriterTable.id]);
  });

  test('two keys left after the claimed one are still refused, naming only those two', () => {
    const ReviewedTable = pgTable('EntityReviewed', {
      ...stringId(),
      authorId: text('author_id').references((): AnyPgColumn => WriterTable.id),
      editorId: text('editor_id').references((): AnyPgColumn => WriterTable.id),
      reviewerId: text('reviewer_id').references((): AnyPgColumn => WriterTable.id),
    });

    const build = () =>
      buildRelations({
        source: ReviewedTable,
        relations: toRelationConfigs({
          relations: {
            author: one(WriterTable, {
              fields: [ReviewedTable.authorId],
              references: [WriterTable.id],
            }),
            editor: one(WriterTable),
          },
        }),
      });

    expect(build).toThrow(
      /2 foreign keys on EntityReviewed reference EntityWriter \(editor_id, reviewer_id\)/,
    );
  });

  test('keys all claimed by written one()s leave a fields-less one() refused', () => {
    expect(() =>
      buildRelations({
        source: ArticleTable,
        relations: toRelationConfigs({
          relations: {
            author: one(WriterTable, {
              fields: [ArticleTable.authorId],
              references: [WriterTable.id],
            }),
            editor: one(WriterTable, {
              fields: [ArticleTable.editorId],
              references: [WriterTable.id],
            }),
            reviewer: one(WriterTable),
          },
        }),
      }),
    ).toThrow(/relation 'reviewer'[\s\S]*author_id, editor_id[\s\S]*Pass fields and references/);
  });

  test('no foreign key either way is refused, with the way out', () => {
    const LonelyTable = pgTable('EntityLonely', { ...stringId() });

    expect(() =>
      buildRelations({
        source: LonelyTable,
        relations: toRelationConfigs({ relations: { policy: one(PolicyTable) } }),
      }),
    ).toThrow(/no foreign key/);
  });

  test('relationName on an inverse one() is refused with advice that works', () => {
    expect(() =>
      buildRelations({
        source: PolicyTable,
        relations: toRelationConfigs({
          relations: { detail: one(PolicyDetailTable, { relationName: 'policy' }) },
        }),
      }),
    ).toThrow(/Remove relationName, or write fields and references on this side/);
  });

  describe('an inverse one() whose target keys this table twice', () => {
    const MemberTable = pgTable('EntityMember', { ...stringId() });
    const MemberCardTable = pgTable('EntityMemberCard', {
      ...stringId(),
      memberId: text('member_id').references((): AnyPgColumn => MemberTable.id),
      issuedBy: text('issued_by').references((): AnyPgColumn => MemberTable.id),
    });

    test('is refused, naming both columns and the escape', () => {
      expect(() =>
        buildRelations({
          source: MemberTable,
          relations: toRelationConfigs({ relations: { card: one(MemberCardTable) } }),
        }),
      ).toThrow(/member_id, issued_by[\s\S]*write fields and references on this side/);
    });

    test('takes the escape: fields and references written reversed are used as written', () => {
      const built = buildRelations({
        source: MemberTable,
        relations: toRelationConfigs({
          relations: {
            card: one(MemberCardTable, {
              fields: [MemberTable.id],
              references: [MemberCardTable.memberId],
            }),
          },
        }),
      });

      const card = built.card;
      expect(is(card, One) ? card.config?.fields : undefined).toEqual([MemberTable.id]);
      expect(is(card, One) ? card.config?.references : undefined).toEqual([
        MemberCardTable.memberId,
      ]);
    });
  });

  test('two fields-less self one()s over one self key are refused, not both read off it', () => {
    expect(() =>
      buildRelations({
        source: NodeTable,
        relations: toRelationConfigs({
          relations: { previous: one(NodeTable), next: one(NodeTable) },
        }),
      }),
    ).toThrow(/previous, next[\s\S]*write fields and references/);
  });

  test('a fields-less self one() beside a written one still reads the one self key', () => {
    const built = buildRelations({
      source: NodeTable,
      relations: toRelationConfigs({
        relations: {
          previous: one(NodeTable),
          next: one(NodeTable, { fields: [NodeTable.id], references: [NodeTable.previousId] }),
        },
      }),
    });

    const previous = built.previous;
    const next = built.next;
    expect(is(previous, One) ? previous.config?.fields : undefined).toEqual([NodeTable.previousId]);
    expect(is(next, One) ? next.config?.fields : undefined).toEqual([NodeTable.id]);
  });

  test('a fields-less self one() reads the self key a written one leaves', () => {
    const ChainTable = pgTable('EntityChain', {
      ...stringId(),
      previousId: text('previous_id').references((): AnyPgColumn => ChainTable.id),
      nextId: text('next_id').references((): AnyPgColumn => ChainTable.id),
    });

    const built = buildRelations({
      source: ChainTable,
      relations: toRelationConfigs({
        relations: {
          previous: one(ChainTable, {
            fields: [ChainTable.previousId],
            references: [ChainTable.id],
          }),
          next: one(ChainTable),
        },
      }),
    });

    const next = built.next;
    expect(is(next, One) ? next.config?.fields : undefined).toEqual([ChainTable.nextId]);
    expect(is(next, One) ? next.config?.references : undefined).toEqual([ChainTable.id]);
  });

  test('the foreign keys are read once, not on every drizzle() schema build', () => {
    let lookups = 0;
    const TargetTable = pgTable('EntityLookupTarget', { ...stringId() });
    const SourceTable = pgTable('EntityLookupSource', {
      ...stringId(),
      targetId: text('target_id').references((): AnyPgColumn => {
        lookups += 1;
        return TargetTable.id;
      }),
    });

    // drizzle runs the callback on every drizzle({ schema }), and the drivers make one per transaction.
    const { relations } = createRelations({
      source: SourceTable,
      relations: toRelationConfigs({ relations: { target: one(TargetTable) } }),
    });
    relations.config(createTableRelationsHelpers(SourceTable));
    const afterFirstBuild = lookups;
    relations.config(createTableRelationsHelpers(SourceTable));
    relations.config(createTableRelationsHelpers(SourceTable));

    expect(afterFirstBuild).toBeGreaterThan(0);
    expect(lookups).toBe(afterFirstBuild);
  });
});

describe('schema discovery pairs every relation once', () => {
  test('an inverse one() nothing pairs fails at discovery, naming the entity and the relation', () => {
    const dataSource = new OrphanDataSource();

    // Bound to the datasource, as an application's are; building one never reads the schema.
    expect(new OrphanUserRepository(dataSource)).toBeDefined();
    expect(new OrphanProfileRepository(dataSource)).toBeDefined();

    expect(() => dataSource.getSchema()).toThrow(
      /relation 'profile' on entity 'EntityOrphanUser'[\s\S]*'EntityOrphanProfile' holds the foreign key[\s\S]*points back to 'EntityOrphanUser'[\s\S]*Add that one\(\) on 'EntityOrphanProfile', or write fields and references on this side/,
    );
  });

  test('relations to tables outside a narrow datasource are one debug line, never a warning', () => {
    // A datasource that carries a subset of models on purpose is a normal shape.
    const dataSource = new StrayDataSource();
    const warnings: Array<string> = [];
    const debugs: Array<string> = [];
    const recorder: ILogger = {
      debug: (message: string) => {
        debugs.push(message);
      },
      info: () => {},
      warn: (message: string) => {
        warnings.push(message);
      },
      error: () => {},
      emerg: () => {},
      log: () => {},
      for: () => recorder,
    };
    dataSource.logger = recorder;
    expect(new StrayOwnerRepository(dataSource)).toBeDefined();

    expect(Object.keys(dataSource.getSchema())).toContain('EntityStrayOwner');
    expect(warnings).toEqual([]);
    expect(debugs.filter(line => line.includes('outside this datasource'))).toEqual([
      expect.stringMatching(
        /1 relation points to a table outside this datasource: EntityStrayOwner\.items -> EntityStrayItem/,
      ),
    ]);
  });

  test('any other relation nothing pairs is reported, and the schema still builds', () => {
    // Hand-written models that boot today keep booting; the warning names what their first query hits.
    const dataSource = new LoneDataSource();
    const warnings: Array<string> = [];
    const recorder: ILogger = {
      debug: () => {},
      info: () => {},
      warn: (message: string) => {
        warnings.push(message);
      },
      error: () => {},
      emerg: () => {},
      log: () => {},
      for: () => recorder,
    };
    dataSource.logger = recorder;
    expect(new LoneAuthorRepository(dataSource)).toBeDefined();
    expect(new LonePostRepository(dataSource)).toBeDefined();

    expect(Object.keys(dataSource.getSchema())).toContain('EntityLoneAuthor');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/relation 'posts' on entity 'EntityLoneAuthor'/);
    expect(warnings[0]).toMatch(
      /A many\(\) pairs with the one\(\) on 'EntityLonePost' named 'posts'[\s\S]*Add that one\(\) on 'EntityLonePost', pointing back to 'EntityLoneAuthor'/,
    );
  });
});

describe('defineEntity end to end on PGlite', () => {
  let dataSource: EntityFactoryDataSource;
  let policies: PolicyRepository;
  let features: PolicyFeatureRepository;
  let details: PolicyDetailRepository;
  let nodes: NodeRepository;
  let writers: WriterRepository;
  let articles: ArticleRepository;
  let policyId: string;

  beforeAll(async () => {
    client = new PGlite();
    await client.waitReady;
    await client.exec(`
      CREATE TABLE "EntityPolicy" (id text primary key, title text not null, secret text);
      CREATE TABLE "EntityPolicyDetail" (id text primary key, policy_id text not null, note text not null);
      CREATE TABLE "EntityPolicyFeature" (id text primary key, policy_id text not null, parent_id text, code text not null);
      CREATE TABLE "EntityNode" (id text primary key, previous_id text, label text not null);
      CREATE TABLE "EntityWriter" (id text primary key, name text not null);
      CREATE TABLE "EntityArticle" (id text primary key, author_id text, editor_id text, title text not null);
    `);

    dataSource = new EntityFactoryDataSource();
    policies = new PolicyRepository(dataSource);
    features = new PolicyFeatureRepository(dataSource);
    details = new PolicyDetailRepository(dataSource);
    nodes = new NodeRepository(dataSource);
    writers = new WriterRepository(dataSource);
    articles = new ArticleRepository(dataSource);

    const created = await policies.create({ data: { title: 'Pro', secret: 'hidden' } });
    policyId = created.data.id;

    const root = await features.create({ data: { policyId, code: 'ROOT' } });
    await features.create({ data: { policyId, parentId: root.data.id, code: 'LEAF' } });
    await details.create({ data: { policyId, note: 'the one detail' } });
  });

  afterAll(async () => {
    await dataSource.endDriver();
  });

  test('mints a UUID v7 id by default', () => {
    expect(policyId).toMatch(UUID_V7);
  });

  test('a many and the inverse side of a one-to-one include together, hidden columns stay hidden', async () => {
    const [policy] = await policies.find<TPolicy>({
      filter: { include: [{ relation: 'features' }, { relation: 'detail' }] },
    });

    expect(policy.title).toBe('Pro');
    expect('secret' in policy).toBe(false);
    expect(policy.features?.map(feature => feature.code).sort()).toEqual(['LEAF', 'ROOT']);
    expect(policy.detail?.note).toBe('the one detail');
  });

  test('a one with no fields resolves through the foreign key, and a self relation walks both ways', async () => {
    const [leaf] = await features.find<TPolicyFeature>({
      filter: {
        where: { code: 'LEAF' },
        include: [{ relation: 'policy' }, { relation: 'parent' }],
      },
    });
    const [root] = await features.find<TPolicyFeature>({
      filter: { where: { code: 'ROOT' }, include: [{ relation: 'children' }] },
    });

    expect(leaf.policy?.id).toBe(policyId);
    expect('secret' in (leaf.policy ?? {})).toBe(false);
    expect(leaf.parent?.code).toBe('ROOT');
    expect(root.children?.map(child => child.code)).toEqual(['LEAF']);
  });

  test('a self one() written reversed walks the list the other way', async () => {
    const first = await nodes.create({ data: { label: 'first' } });
    await nodes.create({ data: { label: 'second', previousId: first.data.id } });

    const [head] = await nodes.find<TNode>({
      filter: { where: { label: 'first' }, include: [{ relation: 'next' }] },
    });
    const [tail] = await nodes.find<TNode>({
      filter: { where: { label: 'second' }, include: [{ relation: 'previous' }] },
    });

    expect(head.next?.label).toBe('second');
    expect(tail.previous?.label).toBe('first');
  });
  test('a fields-less one() reads the key a written one() leaves, and each include finds its own row', async () => {
    const author = await writers.create({ data: { name: 'Ana' } });
    const editor = await writers.create({ data: { name: 'Eli' } });
    await articles.create({
      data: { title: 'Draft', authorId: author.data.id, editorId: editor.data.id },
    });

    const [article] = await articles.find<TArticle>({
      filter: { include: [{ relation: 'author' }, { relation: 'editor' }] },
    });

    expect(article.author?.name).toBe('Ana');
    expect(article.editor?.name).toBe('Eli');
  });
});
