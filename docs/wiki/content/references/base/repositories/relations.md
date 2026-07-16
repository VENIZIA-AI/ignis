---
title: Relations & Includes
description: Declaring model relations and eager-loading them with include
difficulty: intermediate
---

# Relations & Includes

Exhaustive reference for declaring `one`/`many` relations on a model and eager-loading them via `include` - one-to-one, one-to-many, and many-to-many. For the common tasks, start with the [Repositories overview](/references/base/repositories/).

**Files:**

- [`packages/core/src/base/repositories/query-schemas/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/query-schemas/filter.ts) - `TFilter`, `TInclusion`
- [`packages/core/src/base/repositories/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/repositories/common/constants.ts) - `RelationTypes`
- [`packages/core/src/connectors/postgres/repositories/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/common/types.ts) - `TRelationConfig`
- [`packages/core/src/connectors/postgres/repositories/dialect/filter.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/filter.ts) - `FilterBuilder` (`resolveRelations`, `toInclude`)
- [`packages/core/src/connectors/postgres/repositories/dialect/relation.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/relation.ts) - `createRelations` (config -> Drizzle `relations()`)

## Basic Include

### One-to-many: user with posts

```typescript
// Fetch user with their posts
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

### One-to-one: post with author

```typescript
// Fetch post with its author
const post = await postRepository.findOne({
  filter: {
    where: { id: 'p1' },
    include: [{ relation: 'author' }],
  },
});

// Result:
// {
//   id: 'p1',
//   title: 'First Post',
//   authorId: '123',
//   author: { id: '123', name: 'John', email: 'john@example.com' }
// }
```

### Multiple relations

```typescript
// Fetch post with author AND comments
const post = await postRepository.findOne({
  filter: {
    where: { id: 'p1' },
    include: [{ relation: 'author' }, { relation: 'comments' }],
  },
});
```

> [!NOTE]
> When `include` is present in the filter, the repository uses the **Query API** (`connector.query`) instead of the Core API. This is handled automatically by the `canUseCoreAPI` check in `ReadableRelationalRepository` - see [Performance Optimization](./advanced#performance-optimization).

## Scoped Includes

Apply filters, ordering, and limits to included relations using `scope` (itself a `TFilter`).

### Filter related data

```typescript
// User with only published posts
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'posts', scope: { where: { status: 'published' } } }],
  },
});
```

### Order related data

```typescript
// User with posts ordered by date
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'posts', scope: { order: ['createdAt DESC'] } }],
  },
});
```

### Limit related data

```typescript
// User with their 5 most recent posts
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'posts', scope: { order: ['createdAt DESC'], limit: 5 } }],
  },
});
```

### Combined scope options

```typescript
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{
      relation: 'posts',
      scope: {
        where: { status: 'published' },
        order: ['createdAt DESC'],
        limit: 10,
        fields: ['id', 'title', 'createdAt'],
      },
    }],
  },
});
```

### Skip default filter on includes

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

## Nested Includes

Include relations of relations by nesting `include` inside `scope` (2 levels recommended, see [Performance Tips](#performance-tips)).

### Two-level nesting

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

// Result:
// {
//   id: '123',
//   name: 'John',
//   posts: [
//     {
//       id: 'p1',
//       title: 'First Post',
//       comments: [
//         { id: 'c1', text: 'Great post!' },
//         { id: 'c2', text: 'Thanks for sharing' }
//       ]
//     }
//   ]
// }
```

### Many-to-many through junction

This is the pattern `examples/vert` uses for `Product` <-> `SaleChannel` through the `SaleChannelProduct` junction table:

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
//     {
//       productId: 'prod1',
//       saleChannelId: 'ch1',
//       saleChannel: { id: 'ch1', name: 'Online Store' }
//     },
//     {
//       productId: 'prod1',
//       saleChannelId: 'ch2',
//       saleChannel: { id: 'ch2', name: 'Retail' }
//     }
//   ]
// }
```

> [!WARNING] Performance
> Each nested `include` adds SQL complexity. **Maximum 2 levels recommended.** For deeper relationships, use multiple queries - see [Performance Tips](#performance-tips).

## Defining Relations

Relations are declared on the model as a static `relations` resolver returning an array of `TRelationConfig`. The framework translates them to Drizzle ORM relations internally during schema discovery.

### Relation config type

```typescript
type TRelationConfig = {
  name: string; // Relation name used in includes
} & (
  | {
      type: 'one';   // one-to-one or many-to-one
      schema: TTableSchemaWithId;
      metadata: { fields, references, relationName? }; // Drizzle one() params
    }
  | {
      type: 'many';  // one-to-many
      schema: TTableSchemaWithId;
      metadata: { relationName? };                      // Drizzle many() params
    }
);
```

`metadata`'s shape is inferred directly from Drizzle's own `one()`/`many()` relation-helper parameter types, not hand-duplicated.

### In your model

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

The resolver form (`() => [...]`) defers evaluation until all `@model` classes are registered, avoiding circular-import ordering issues between related models.

### Relation types

| Type | Drizzle function | Description | Example |
|------|------------------|-------------|---------|
| `RelationTypes.ONE` (`'one'`) | `one()` | One-to-one or many-to-one | Post has one Author, User has one Profile |
| `RelationTypes.MANY` (`'many'`) | `many()` | One-to-many | User has many Posts |

> [!NOTE]
> Unlike LoopBack 4's `hasMany`/`hasOne`/`belongsTo` terminology, IGNIS uses Drizzle ORM's relation model, which has only `one` and `many` types. A "belongsTo" relationship is expressed as `type: RelationTypes.ONE` with `fields` (local FK) and `references` (remote PK) in `metadata`.

### Example: model with both types

This mirrors `examples/vert`'s `SaleChannelProduct` junction model - one `ONE` relation per foreign key, plus a `MANY` relation elsewhere:

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

### How configs become Drizzle relations

- **`MetadataRegistry` resolves the configs.** During schema discovery, it resolves each model's `relations` array and passes it to the `createRelations` helper ([`packages/core/src/connectors/postgres/repositories/dialect/relation.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/connectors/postgres/repositories/dialect/relation.ts)).
- **`createRelations` builds the Drizzle definition.** It produces the actual Drizzle `relations()` definition, registered on the DataSource schema.
- **Application code never calls it.** `createRelations` is internal - you only declare the `relations` resolver on the model.

## Auto-Resolution

- **Resolved from the model, not the constructor.** Relations are automatically resolved from the entity's static `relations` property via `MetadataRegistry` - no need to pass them in the repository constructor.
- **Memoized per schema.** `FilterBuilder.resolveRelations()` reads and caches them in a `WeakMap` when building include queries.

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // Relations auto-resolved from User.relations!
}
```

## Hidden Properties in Relations

When building include queries, `FilterBuilder.toInclude()` automatically:

1. Resolves hidden properties for each related model via `resolveHiddenProperties()`.
2. Resolves the default filter for each related model via `resolveDefaultFilter()` (unless `shouldSkipDefaultFilter` is set on that inclusion).
3. Merges the default filter with any user-provided `scope` via `mergeFilter()`.
4. Excludes hidden columns from the nested query's `columns` selection.

```typescript
// User model has hiddenProperties: ['password']
const post = await postRepository.findOne({
  filter: { include: [{ relation: 'author' }] },
});

// post.author will NOT include password - excluded at SQL level
```

See [Hidden Properties](./advanced#hidden-properties) for the top-level equivalent.

## Type Safety with Generics

For queries with `include`, use generic type overrides for full type safety:

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

### Nested relations type

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

## TInclusion Type Reference

Each element in the `include` array has this shape:

```typescript
type TInclusion = {
  relation: string;                    // Name of the relation to include
  scope?: TFilter;                     // Optional nested filter (where, order, limit, fields, include)
  shouldSkipDefaultFilter?: boolean;   // Skip the related model's default filter
};
```

## Common Patterns

### Find all with count of relations

```typescript
// Get users with post count
const users = await userRepository.find({
  filter: {
    include: [{ relation: 'posts', scope: { fields: ['id'] } }], // Only fetch IDs to minimize data
  },
});

const usersWithCounts = users.map(user => ({
  ...user,
  postCount: (user as any).posts?.length ?? 0,
}));
```

### Conditional include

```typescript
async function getUser(id: string, includePosts: boolean) {
  const include = includePosts ? [{ relation: 'posts' }] : [];

  return userRepository.findOne({
    filter: { where: { id }, include },
  });
}
```

## Error Handling

### Relation not found

If you try to include a relation that doesn't exist:

```typescript
// Error: [FilterBuilder][toInclude] Relation NOT FOUND | relation: 'nonExistent'
await userRepository.find({
  filter: { include: [{ relation: 'nonExistent' }] },
});
```

**Fix:** check your model's `relations` definition and ensure the relation name matches.

### Invalid include format

```typescript
// Error: [FilterBuilder][toInclude] Invalid include format | include: ...
```

**Fix:** ensure each include element has a `relation` string property.

### Schema key mismatch

```
Error: [UserRepository] Schema key mismatch | Entity name 'User' not found
in connector.query | Available keys: [Post, Comment]
```

**Fix:** ensure your model's `TABLE_NAME` matches the schema registration - see [Query Interface Validation](./advanced#query-interface-validation).

## Performance Tips

1. **Limit nesting depth** - max 2 levels recommended.
2. **Use `fields` in scope** - only fetch needed columns.
3. **Use `limit` in scope** - don't fetch unbounded related data.
4. **Consider separate queries** - for complex data needs, multiple simple queries often outperform one complex nested query.
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

## Quick Reference

| Want to... | Code |
|------------|------|
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
