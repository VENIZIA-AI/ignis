# Relations & Includes

Fetch related data using `include` for eager loading. This guide covers one-to-one, one-to-many, and many-to-many relationships.


## Basic Include

### One-to-Many: User with Posts

```typescript
// Fetch user with their posts
const user = await userRepo.findOne({
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
const post = await postRepo.findOne({
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
const post = await postRepo.findOne({
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
const user = await userRepo.findOne({
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
const user = await userRepo.findOne({
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
const user = await userRepo.findOne({
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
const user = await userRepo.findOne({
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
const user = await userRepo.findOne({
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
const user = await userRepo.findOne({
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
const product = await productRepo.findOne({
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

Relations are defined using the `createRelations` helper and the `TRelationConfig` type. These use Drizzle ORM's relation system under the hood.

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
import { createRelations } from '@venizia/ignis';

export const userTable = pgTable('User', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});

const userRelationsConfig = createRelations({
  source: userTable,
  relations: [
    {
      type: 'many',
      schema: postTable,
      name: 'posts',
      metadata: { relationName: 'posts' },
    },
  ],
});

@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
  static override relations = () => userRelationsConfig.definitions;
  static override TABLE_NAME = 'User';
}
```

### Relation Types

| Type | Drizzle Function | Description | Example |
|------|------------------|-------------|---------|
| `'one'` | `one()` | One-to-one or many-to-one | Post has one Author, User has one Profile |
| `'many'` | `many()` | One-to-many | User has many Posts |

> [!NOTE]
> Unlike LoopBack 4's `hasMany`/`hasOne`/`belongsTo` terminology, Ignis uses Drizzle ORM's relation model which has only `one` and `many` types. A "belongsTo" relationship is expressed as `type: 'one'` with `fields` (local FK) and `references` (remote PK) in the metadata.

### Example: Post Model with Both Types

```typescript
const postRelationsConfig = createRelations({
  source: postTable,
  relations: [
    {
      type: 'one',
      schema: userTable,
      name: 'author',
      metadata: {
        fields: [postTable.authorId],
        references: [userTable.id],
      },
    },
    {
      type: 'many',
      schema: commentTable,
      name: 'comments',
      metadata: { relationName: 'comments' },
    },
  ],
});
```

### createRelations Return Value

`createRelations` returns an object with two properties:

```typescript
const result = createRelations({ source, relations });

result.definitions;  // Record<string, TRelationConfig> - keyed by relation name
result.relations;    // Drizzle relations() call result - pass to DataSource schema
```

- **`definitions`**: Used by `BaseEntity.relations` for include resolution at runtime.
- **`relations`**: The actual Drizzle ORM relations definition, needed for DataSource schema registration.


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
const post = await postRepo.findOne({
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
const user = await userRepo.findOne<UserWithPosts>({
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

const product = await productRepo.findOne<ProductWithChannels>({
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
const users = await userRepo.find({
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

  return userRepo.findOne({
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
await userRepo.find({
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
const user = await userRepo.findById({ id: '123' });
const posts = await postRepo.find({
  filter: {
    where: { authorId: '123' },
    limit: 10
  }
});
const comments = await commentRepo.find({
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
  - [Repository Mixins](./mixins) - Default filter and fields visibility
  - [Filter System](/references/base/filter-system/) - Query operators

- **External Resources:**
  - [Drizzle ORM Relations](https://orm.drizzle.team/docs/rqb#relations) - Relation definition guide
