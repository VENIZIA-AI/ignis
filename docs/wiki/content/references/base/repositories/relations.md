# Relations & Includes

Fetch related data using `include` for eager loading. This guide covers one-to-one, one-to-many, and many-to-many relationships.


## Basic Include

### One-to-Many: User with Posts

```typescript
// Fetch user with their posts
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'posts' }]
  }
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

### One-to-One: Post with Author

```typescript
// Fetch post with its author
const post = await postRepository.findOne({
  filter: {
    where: { id: 'p1' },
    include: [{ relation: 'author' }]
  }
});

// Result:
// {
//   id: 'p1',
//   title: 'First Post',
//   authorId: '123',
//   author: { id: '123', name: 'John', email: 'john@example.com' }
// }
```

### Multiple Relations

```typescript
// Fetch post with author AND comments
const post = await postRepository.findOne({
  filter: {
    where: { id: 'p1' },
    include: [
      { relation: 'author' },
      { relation: 'comments' }
    ]
  }
});
```

> [!NOTE]
> When `include` is present in the filter, the repository uses the **Query API** (`connector.query`) instead of the Core API. This is handled automatically by the `canUseCoreAPI` check in `ReadableRepository`.


## Scoped Includes

Apply filters, ordering, and limits to included relations using `scope`:

### Filter Related Data

```typescript
// User with only published posts
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{
      relation: 'posts',
      scope: {
        where: { status: 'published' }
      }
    }]
  }
});
```

### Order Related Data

```typescript
// User with posts ordered by date
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{
      relation: 'posts',
      scope: {
        order: ['createdAt DESC']
      }
    }]
  }
});
```

### Limit Related Data

```typescript
// User with their 5 most recent posts
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{
      relation: 'posts',
      scope: {
        order: ['createdAt DESC'],
        limit: 5
      }
    }]
  }
});
```

### Combined Scope Options

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
        fields: ['id', 'title', 'createdAt']
      }
    }]
  }
});
```

### Skip Default Filter on Includes

Each inclusion can independently bypass the related model's default filter:

```typescript
// Include soft-deleted posts that would normally be filtered out
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{
      relation: 'posts',
      shouldSkipDefaultFilter: true
    }]
  }
});
```


## Nested Includes

Include relations of relations (up to 2 levels recommended):

### Two-Level Nesting

```typescript
// User -> Posts -> Comments
const user = await userRepository.findOne({
  filter: {
    where: { id: '123' },
    include: [{
      relation: 'posts',
      scope: {
        include: [{ relation: 'comments' }]
      }
    }]
  }
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

### Many-to-Many Through Junction

```typescript
// Product -> SaleChannelProduct (junction) -> SaleChannel
const product = await productRepository.findOne({
  filter: {
    where: { id: 'prod1' },
    include: [{
      relation: 'saleChannelProducts',
      scope: {
        include: [{ relation: 'saleChannel' }]
      }
    }]
  }
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

> **Performance Warning:** Each nested `include` adds SQL complexity. **Maximum 2 levels recommended.** For deeper relationships, use multiple queries.


## Defining Relations

Relations are declared on the model as a static `relations` resolver returning an array of `TRelationConfig`. The framework translates them to Drizzle ORM relations internally during schema discovery.

### Relation Config Type

```typescript
type TRelationConfig = {
  name: string;  // Relation name used in includes
} & (
  | {
      type: 'one';   // one-to-one or many-to-one
      schema: TTableSchemaWithId;
      metadata: { fields, references, relationName? };
    }
  | {
      type: 'many';  // one-to-many
      schema: TTableSchemaWithId;
      metadata: { relationName? };
    }
);
```

### In Your Model

```typescript
// src/models/user.model.ts
import { model, RelationTypes } from '@venizia/ignis';
import { BasePostgresEntity, TRelationConfig } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { Post } from './post.model';

@model({ type: 'entity' })
export class User extends BasePostgresEntity<typeof User.schema> {
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

### Relation Types

| Type | Drizzle Function | Description | Example |
|------|------------------|-------------|---------|
| `'one'` | `one()` | One-to-one or many-to-one | Post has one Author, User has one Profile |
| `'many'` | `many()` | One-to-many | User has many Posts |

> [!NOTE]
> Unlike LoopBack 4's `hasMany`/`hasOne`/`belongsTo` terminology, IGNIS uses Drizzle ORM's relation model which has only `one` and `many` types. A "belongsTo" relationship is expressed as `type: 'one'` with `fields` (local FK) and `references` (remote PK) in the metadata.

### Example: Post Model with Both Types

```typescript
@model({ type: 'entity' })
export class Post extends BasePostgresEntity<typeof Post.schema> {
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

### How Configs Become Drizzle Relations

During schema discovery, `MetadataRegistry` resolves each model's `relations` array and passes it to the `createRelations` helper (`packages/core/src/connectors/postgres/repositories/operators/relation.ts`), which builds the actual Drizzle `relations()` definition registered on the DataSource schema. You do not call `createRelations` yourself in application code.


## Auto-Resolution

Relations are automatically resolved from the entity's static `relations` property via `MetadataRegistry`. The `FilterBuilder.resolveRelations()` method reads them when building include queries. No need to pass them in the repository constructor:

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // Relations auto-resolved from User.relations!
}
```


## Hidden Properties in Relations

When building include queries, the `FilterBuilder.toInclude()` method automatically:

1. Resolves hidden properties for each related model via `resolveHiddenProperties()`.
2. Resolves the default filter for each related model via `resolveDefaultFilter()`.
3. Merges the default filter with any user-provided `scope`.
4. Excludes hidden columns from the nested query's `columns` selection.

```typescript
// User model has hiddenProperties: ['password']
const post = await postRepository.findOne({
  filter: {
    include: [{ relation: 'author' }]
  }
});

// post.author will NOT include password - excluded at SQL level
```


## Type Safety with Generics

For queries with `include`, use generic type overrides for full type safety:

```typescript
// Define the expected return type
type UserWithPosts = User & {
  posts: Post[];
};

// Use generic override
const user = await userRepository.findOne<UserWithPosts>({
  filter: {
    where: { id: '123' },
    include: [{ relation: 'posts' }]
  }
});

// TypeScript knows the structure!
if (user) {
  console.log(user.posts[0].title);  // Fully typed
}
```

### Nested Relations Type

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
      scope: {
        include: [{ relation: 'saleChannel' }]
      }
    }]
  }
});

// Fully typed access
product?.saleChannelProducts[0].saleChannel.name;
```


## TInclusion Type Reference

Each element in the `include` array has this shape:

```typescript
type TInclusion = {
  relation: string;             // Name of the relation to include
  scope?: TFilter;              // Optional nested filter (where, order, limit, fields, include)
  shouldSkipDefaultFilter?: boolean;  // Skip the related model's default filter
};
```


## Common Patterns

### Find All with Count of Relations

```typescript
// Get users with post count
const users = await userRepository.find({
  filter: {
    include: [{
      relation: 'posts',
      scope: { fields: ['id'] }  // Only fetch IDs to minimize data
    }]
  }
});

// Calculate counts
const usersWithCounts = users.map(user => ({
  ...user,
  postCount: (user as any).posts?.length ?? 0
}));
```

### Conditional Include

```typescript
async function getUser(id: string, includePosts: boolean) {
  const include = includePosts
    ? [{ relation: 'posts' }]
    : [];

  return userRepository.findOne({
    filter: {
      where: { id },
      include
    }
  });
}
```


## Error Handling

### Relation Not Found

If you try to include a relation that doesn't exist:

```typescript
// Error: [FilterBuilder][toInclude] Relation NOT FOUND | relation: 'nonExistent'
await userRepository.find({
  filter: {
    include: [{ relation: 'nonExistent' }]
  }
});
```

**Fix:** Check your model's `relations` definition and ensure the relation name matches.

### Invalid Include Format

```typescript
// Error: [FilterBuilder][toInclude] Invalid include format | include: ...
```

**Fix:** Ensure each include element has a `relation` string property.

### Schema Key Mismatch

```
Error: [UserRepository] Schema key mismatch | Entity name 'User' not found
in connector.query | Available keys: [Post, Comment]
```

**Fix:** Ensure your model's `TABLE_NAME` matches the schema registration.


## Performance Tips

1. **Limit nesting depth** - Max 2 levels recommended
2. **Use `fields` in scope** - Only fetch needed columns
3. **Use `limit` in scope** - Don't fetch unbounded related data
4. **Consider separate queries** - For complex data needs, multiple simple queries often outperform one complex nested query
5. **Use `shouldSkipDefaultFilter` sparingly** - Only when you explicitly need filtered-out records

```typescript
// Instead of deep nesting, use separate queries
const user = await userRepository.findById({ id: '123' });
const posts = await postRepository.find({
  filter: {
    where: { authorId: '123' },
    limit: 10
  }
});
const comments = await commentRepository.find({
  filter: {
    where: { postId: { inq: posts.map(p => p.id) } }
  }
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


## Next Steps

- [JSON Path Filtering](../filter-system/json-filtering) - Query JSONB columns
- [Array Operators](../filter-system/array-operators) - PostgreSQL array queries
- [Advanced Features](./advanced.md) - Transactions, hidden props

## See Also

- **Related Concepts:**
  - [Repositories Overview](./index) - Core repository operations
  - [Models](/guides/core-concepts/persistent/models) - Defining model relationships

- **Related Topics:**
  - [Advanced Features](./advanced) - Hidden properties, transactions
  - [Repository Mixins (Removed)](./mixins) - Where default-filter and fields-visibility behavior lives now
  - [Filter System](/references/base/filter-system/) - Query operators

- **External Resources:**
  - [Drizzle ORM Relations](https://orm.drizzle.team/docs/rqb#relations) - Relation definition guide
