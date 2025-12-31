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


## Nested Includes

Include relations of relations (up to 2 levels recommended):

### Two-Level Nesting

```typescript
// User → Posts → Comments
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
// Product → SaleChannelProduct (junction) → SaleChannel
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

Relations must be defined in your model before you can `include` them.

### In Your Model

```typescript
// src/models/user.model.ts
import { createRelations } from '@venizia/ignis';

export const userTable = pgTable('User', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});

export const userRelations = createRelations({
  source: userTable,
  relations: [
    {
      type: 'hasMany',
      model: () => Post,       // Target model
      foreignKey: 'authorId',  // FK in Post table
      name: 'posts',           // Relation name for includes
    },
  ],
});

@model({ type: 'entity' })
export class User extends BaseEntity<typeof User.schema> {
  static override schema = userTable;
  static override relations = () => userRelations.definitions;
  static override TABLE_NAME = 'User';
}
```

### Relation Types

| Type | Description | Example |
|------|-------------|---------|
| `hasMany` | One-to-many | User has many Posts |
| `hasOne` | One-to-one | User has one Profile |
| `belongsTo` | Inverse of hasMany/hasOne | Post belongs to User |

### Example: Post Model

```typescript
export const postRelations = createRelations({
  source: postTable,
  relations: [
    {
      type: 'belongsTo',
      model: () => User,
      foreignKey: 'authorId',
      name: 'author',
    },
    {
      type: 'hasMany',
      model: () => Comment,
      foreignKey: 'postId',
      name: 'comments',
    },
  ],
});
```


## Auto-Resolution

Relations are automatically resolved from the entity's static `relations` property. No need to pass them in the repository constructor:

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // Relations auto-resolved from User.relations!
}
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

### Include with Hidden Properties

Hidden properties (like `password`) are automatically excluded from included relations:

```typescript
// User model has hiddenProperties: ['password']
const post = await postRepo.findOne({
  filter: {
    include: [{ relation: 'author' }]
  }
});

// post.author will NOT include password
```


## Error Handling

### Relation Not Found

If you try to include a relation that doesn't exist:

```typescript
// Error: Relation 'nonExistent' not found in User relations
await userRepo.find({
  filter: {
    include: [{ relation: 'nonExistent' }]
  }
});
```

**Fix:** Check your model's `relations` definition.

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
    where: { postId: { in: posts.map(p => p.id) } }
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


## Next Steps

- [JSON Path Filtering](./json-filtering.md) - Query JSONB columns
- [Array Operators](./array-operators.md) - PostgreSQL array queries
- [Advanced Features](./advanced.md) - Transactions, hidden props
