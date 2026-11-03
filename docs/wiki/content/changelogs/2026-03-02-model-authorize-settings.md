---
title: Model Authorize Settings
description: Declare a model's authorization principal in its @model settings and read it back from the model or the MetadataRegistry.
packages: ['@venizia/ignis']
---

# Changelog - 2026-03-02

## Model Authorize Settings

**In one line.** A model can now declare its own authorization principal, so you stop repeating resource strings like `'Article'` in route configs.

## What changed

- **`authorize` in `@model` settings.** Set `settings: { authorize: { principal: 'article' } }`. The type is `IModelAuthorizeSettings`: a required `principal` plus any extra fields you want.
- **`AUTHORIZATION_SUBJECT` is filled in for you.** The `@model` decorator sets `BaseEntity.AUTHORIZATION_SUBJECT` from `authorize.principal`. A value you set on the class yourself wins.
- **Three `MetadataRegistry` methods.** `getModelAuthorizeSettings({ name })` returns one model's settings. `getAuthorizeModelPrincipals({ format })` returns all principals as an `'array'` or a `'record'`. `getAuthorizeModelSettings({ format })` returns the full settings with each model's registry entry.

## Who is affected

- **Everyone.** Additive only; `@model` decorators without `authorize` keep working unchanged.

## Details

```typescript
@model({
  type: 'entity',
  settings: { authorize: { principal: 'article' } },
})
export class Article extends BaseEntity<typeof Article.schema> { /* ... */ }

Article.AUTHORIZATION_SUBJECT; // 'article'

authorize: {
  action: AuthorizationActions.READ,
  resource: Article.AUTHORIZATION_SUBJECT,
}

const registry = MetadataRegistry.getInstance();
registry.getModelAuthorizeSettings({ name: 'Article' });          // { principal: 'article' } | undefined
registry.getAuthorizeModelPrincipals({ format: 'array' });        // ['article', 'user', ...]
registry.getAuthorizeModelPrincipals({ format: 'record' });       // { Article: 'article', User: 'user', ... }
```
