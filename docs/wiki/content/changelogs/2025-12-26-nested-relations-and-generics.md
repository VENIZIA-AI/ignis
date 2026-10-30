---
title: Nested Relations & Generic Types
description: Repository include filters now work at any depth, and repository methods accept a generic return type.
packages: ['@venizia/ignis']
---

# Changelog - 2025-12-26

## Nested Relations Support & Generic Repository Types

**In one line.** You can include relations inside relations, and type the result of `find` and `findOne` without casting.

## What changed

- **Nested includes.** `include` filters work recursively to any depth.
- **Generic return types.** `find<R>`, `findOne<R>` and the other read and write methods accept a type parameter that defaults to the entity schema.

```typescript
const result = await repo.findOne({
  filter: {
    include: [{
      relation: 'orders',
      scope: {
        include: [{ relation: 'items' }] // Level 2
      }
    }]
  }
});

type UserWithPosts = User & { posts: Post[] };

const user = await userRepo.findOne<UserWithPosts>({
  filter: { include: [{ relation: 'posts' }] }
});
console.log(user?.posts.length);
```

## Who is affected

- **Existing code.** No action needed. The type parameter is optional and existing calls keep the default return type.
