---
title: Relations & Includes
description: Declaring model relations and eager-loading them with include
difficulty: intermediate
---

# Relations & Includes

Declare `one`/`many` relations on a model, then eager-load them with `include` on any `find`/`findOne` call - one-to-one, one-to-many, and many-to-many. For CRUD basics, start with the [Repositories overview](/references/base/repositories/).

## In one example

```typescript
// Fetch a user with their posts
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'posts' }],
  },
});

// Result:
// {
//   id: '123',
//   name: 'John',
//   posts: [
//     { id: 'p1', title: 'First Post', authorId: '123' },
//     { id: 'p2', title: 'Second Post', authorId: '123' }
//   ]
// }
```

> [!NOTE]
> An `include` in the filter routes the query through Drizzle's Query API (`connector.query`) instead of the Core API. The `canUseCoreAPI` check in `ReadableRelationalRepository` makes that choice automatically. Core API is ~15-20% faster but skips relations and field selection. See [Performance Optimization](./advanced#performance-optimization).

## `TInclusion` options

Each element of the `include` array accepts:

| Option | Type | Default | Meaning |
|---|---|---|---|
| `relation` | `string` | required | Name of the relation to include, matching an entry in the model's `relations` array |
| `scope` | `TFilter` | none | Nested filter on the related rows - `where`, `order`, `limit`, `fields`, `include` |
| `shouldSkipDefaultFilter` | `boolean` | `false` | Skip the related model's default filter for this inclusion only |

`scope` takes the same shape as a top-level filter - see the [Filter System](/references/base/filter-system/) reference for every `where` operator.

## Declaring relations on a model

Relations are declared as a static `relations` resolver on the model, returning an array of `TRelationConfig`. `MetadataRegistry` resolves the array during schema discovery and passes it to `createRelations`. `createRelations` builds the actual Drizzle `relations()` definition - application code never calls it directly.

```typescript
// src/models/user.model.ts
import { model, RelationTypes } from '@venizia/ignis';
import { BaseEntity, TRelationConfig } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { Post } from './post.model';

@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
  });

  static override relations = (): TRelationConfig[] => [
    {
      name: 'posts',
      type: RelationTypes.MANY,
      schema: Post.schema,
      metadata: { relationName: 'posts' },
    },
  ];
}
```

Write the resolver as an arrow function (`() => [...]`), not a plain array. IGNIS defers evaluation until every `@model` class has registered, which avoids circular-import ordering issues between related models.

### `TRelationConfig` fields

| Field | Type | Meaning |
|---|---|---|
| `name` | `string` | Relation name used in `include` |
| `type` | `RelationTypes.ONE` \| `RelationTypes.MANY` | Which Drizzle relation helper to build |
| `schema` | `TTableSchemaWithId` | The related model's Drizzle table schema |
| `metadata` | inferred from Drizzle's `one()`/`many()` params | `{ fields, references, relationName? }` for `ONE`; `{ relationName? }` for `MANY` |

`metadata`'s shape comes straight from Drizzle's own `one()`/`many()` parameter types, not a hand-duplicated one.

### Relation types

| Type | Drizzle function | Description | Example |
|---|---|---|---|
| `RelationTypes.ONE` (`'one'`) | `one()` | One-to-one or many-to-one | Post has one Author, User has one Profile |
| `RelationTypes.MANY` (`'many'`) | `many()` | One-to-many | User has many Posts |

> [!NOTE]
> LoopBack 4 names these `hasMany`/`hasOne`/`belongsTo`. IGNIS uses Drizzle ORM's relation model instead, which has only `one` and `many`. A "belongsTo" relationship is `type: RelationTypes.ONE` with `fields` (the local foreign key) and `references` (the remote primary key) in `metadata`.

### A model with both types

This mirrors `examples/vert`'s `SaleChannelProduct` junction model: one `ONE` relation per foreign key, plus a `MANY` relation elsewhere.

```typescript
@model({ type: 'entity' })
export class Post extends BaseEntity<typeof Post.schema> {
  static override schema = postTable;

  static override relations = (): TRelationConfig[] => [
    {
      name: 'author',
      type: RelationTypes.ONE,
      schema: User.schema,
      metadata: {
        fields: [Post.schema.authorId],
        references: [User.schema.id],
      },
    },
    {
      name: 'comments',
      type: RelationTypes.MANY,
      schema: Comment.schema,
      metadata: { relationName: 'comments' },
    },
  ];
}
```

### Auto-resolution in the repository

The repository never receives relations through its constructor. `MetadataRegistry` resolves them from the entity's static `relations` property. `FilterBuilder.resolveRelations()` reads and caches the result in a `WeakMap` the first time an include query needs them.

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // Relations auto-resolved from User.relations!
}
```

## Recipes

### Include multiple relations

```typescript
const post = await postRepository.findOne({
  filter: {
    where: { id: 'p1' },
    include: [{ relation: 'author' }, { relation: 'comments' }],
  },
});
```

### Filter, order, and limit included rows

Combine `where`, `order`, `limit`, and `fields` inside `scope` the same way you would on a top-level filter:

```typescript
// User with their 5 most recent published posts, id and title only
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{
      relation: 'posts',
      scope: {
        where: { status: 'published' },
        order: ['createdAt DESC'],
        limit: 5,
        fields: ['id', 'title', 'createdAt'],
      },
    }],
  },
});
```

### Skip the default filter on one inclusion

Each inclusion can independently bypass the related model's default filter:

```typescript
// Include soft-deleted posts that would normally be filtered out
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'posts', shouldSkipDefaultFilter: true }],
  },
});
```

### Nest includes two levels deep

Put an `include` inside a `scope` to load a relation of a relation:

```typescript
// User -> Posts -> Comments
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{
      relation: 'posts',
      scope: { include: [{ relation: 'comments' }] },
    }],
  },
});
```

> [!WARNING] Performance
> Each nested `include` adds SQL complexity. **Maximum 2 levels recommended.** For deeper relationships, run multiple queries instead - see [Performance Tips](#performance-tips).

### Many-to-many through a junction table

This is the pattern `examples/vert` uses for `Product` <-> `SaleChannel` through the `SaleChannelProduct` junction table. Include the junction relation, then nest the far side inside its `scope`.

```typescript
// Product -> SaleChannelProduct (junction) -> SaleChannel
const product = await productRepository.findOne({
  filter: {
    where: { id: 'prod1' },
    include: [{
      relation: 'saleChannelProducts',
      scope: { include: [{ relation: 'saleChannel' }] },
    }],
  },
});

// Result:
// {
//   id: 'prod1',
//   name: 'Widget',
//   saleChannelProducts: [
//     { productId: 'prod1', saleChannelId: 'ch1', saleChannel: { id: 'ch1', name: 'Online Store' } },
//     { productId: 'prod1', saleChannelId: 'ch2', saleChannel: { id: 'ch2', name: 'Retail' } }
//   ]
// }
```

### Count relations without fetching them fully

Fetch only `id` on the related rows to keep the payload small, then count the array client-side:

```typescript
const users = await userRepository.find({
  filter: {
    include: [{ relation: 'posts', scope: { fields: ['id'] } }],
  },
});

const usersWithCounts = users.map(user => ({
  ...user,
  postCount: (user as any).posts?.length ?? 0,
}));
```

### Include conditionally

```typescript
async function getUser(id: string, includePosts: boolean) {
  const include = includePosts ? [{ relation: 'posts' }] : [];

  return userRepository.findOne({
    filter: { where: { id }, include },
  });
}
```

### Type included results with a generic

`findOne`/`find` accept a type argument for the shape `include` produces, so the result is fully typed instead of falling back to the base entity:

```typescript
type UserWithPosts = User & {
  posts: Post[];
};

const user = await userRepository.findOne<UserWithPosts>({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'posts' }],
  },
});

if (user) {
  console.log(user.posts[0].title); // Fully typed
}
```

The same pattern nests for a two-level include:

```typescript
type ProductWithChannels = Product & {
  saleChannelProducts: (SaleChannelProduct & {
    saleChannel: SaleChannel;
  })[];
};

const product = await productRepository.findOne<ProductWithChannels>({
  filter: {
    where: { id: 'prod1' },
    include: [{
      relation: 'saleChannelProducts',
      scope: { include: [{ relation: 'saleChannel' }] },
    }],
  },
});

product?.saleChannelProducts[0].saleChannel.name; // Fully typed access
```

## Hidden properties in relations

`FilterBuilder.toInclude()` excludes hidden columns from every included relation at the SQL level, the same way the top-level query does. For each inclusion it resolves the related model's `hiddenProperties` and default filter, and merges the default filter with your `scope` via `mergeFilter()`. It then drops hidden columns from the nested `columns` selection.

```typescript
// User model has hiddenProperties: ['password']
const post = await postRepository.findOne({
  filter: { include: [{ relation: 'author' }] },
});

// post.author will NOT include password - excluded at SQL level
```

See [Hidden Properties](./advanced#hidden-properties) for the top-level equivalent.

## Errors

| Error | Cause | Fix |
|---|---|---|
| `[FilterBuilder][toInclude] Relation NOT FOUND \| relation: 'x'` | `include` names a relation absent from the model's `relations` array | Check the model's `relations` definition and match the name exactly |
| `[FilterBuilder][toInclude] Invalid include format \| include: ...` | An `include` element has no `relation` string | Give every include element a `relation` field |
| `[<Repository>] Schema key mismatch \| Entity name 'X' not found in connector.query` | The model's `TABLE_NAME` doesn't match its schema registration | See [Query Interface Validation](./advanced#query-interface-validation) |

## Performance tips

1. **Limit nesting depth** - max 2 levels recommended.
2. **Use `fields` in scope** - fetch only the columns you need.
3. **Use `limit` in scope** - don't fetch unbounded related data.
4. **Consider separate queries** - for complex data needs, several simple queries often outperform one deeply nested one.
5. **Use `shouldSkipDefaultFilter` sparingly** - only when you explicitly need filtered-out records.

```typescript
// Instead of deep nesting, use separate queries
const user = await userRepository.findById({ id: '123' });
const posts = await postRepository.find({
  filter: { where: { authorId: '123' }, limit: 10 },
});
const comments = await commentRepository.find({
  filter: { where: { postId: { inq: posts.map(p => p.id) } } },
});
```

## Quick reference

| Want to... | Code |
|---|---|
| Include one relation | `include: [{ relation: 'posts' }]` |
| Include multiple | `include: [{ relation: 'posts' }, { relation: 'profile' }]` |
| Filter included | `include: [{ relation: 'posts', scope: { where: { status: 'active' } } }]` |
| Order included | `include: [{ relation: 'posts', scope: { order: ['createdAt DESC'] } }]` |
| Limit included | `include: [{ relation: 'posts', scope: { limit: 5 } }]` |
| Nested include | `include: [{ relation: 'posts', scope: { include: [{ relation: 'comments' }] } }]` |
| Select fields | `include: [{ relation: 'posts', scope: { fields: ['id', 'title'] } }]` |
| Skip default filter | `include: [{ relation: 'posts', shouldSkipDefaultFilter: true }]` |

## See also

- [Repositories overview](/references/base/repositories/) - CRUD basics, common tasks
- [Advanced Features](./advanced) - transactions, hidden properties, performance
- [Repository Mixins (Removed)](./mixins) - where default-filter and fields-visibility behavior lives now
- [Filter System](/references/base/filter-system/) - every `where` operator, ordering, pagination
- [Models - Full Reference](/references/base/models-reference) - `@model`, entity hierarchy, schema enrichers
- [Drizzle ORM Relations](https://orm.drizzle.team/docs/rqb#relations) - relation definition guide

**Files:**

- [`packages/filter/src/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/filter/src/common/types.ts) - `TFilter`, `TInclusion`
- [`packages/kernel/src/base/repositories/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/repositories/common/constants.ts) - `RelationTypes`
- [`packages/connectors/src/relational/postgres/repositories/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/common/types.ts) - `TRelationConfig`
- [`packages/connectors/src/relational/core/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/core/repositories/dialect/filter.ts) - `FilterBuilder` (`resolveRelations`, `toInclude`)
- [`packages/connectors/src/relational/postgres/repositories/dialect/relation.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/relational/postgres/repositories/dialect/relation.ts) - `createRelations` (config -> Drizzle `relations()`)
