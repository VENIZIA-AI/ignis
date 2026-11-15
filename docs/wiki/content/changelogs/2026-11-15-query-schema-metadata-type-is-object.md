---
title: The query schema metadata names its type as 'object'
description: "TSchemaMetadata.type is 'object' instead of string, a query schema decorator refuses anything that is not a zod schema, and resolveModelRelations takes only the entry fields it reads."
packages: ['@venizia/ignis-filter', '@venizia/ignis-kernel']
migration:
  - id: schema-metadata-type-is-object
    symbols: [TSchemaMetadata, TSchemaDecorator]
    upgrade:
      before: |
        const decorate: TSchemaDecorator = (schema, metadata) => {
          const type: string | undefined = metadata.type;

          return withDocs(schema, { ...metadata, type });
        };
      after: |
        // metadata.type is 'object' | undefined: a decorator that widened it to string still compiles,
        // but a call that builds its own TSchemaMetadata with another string no longer does
        const decorate: TSchemaDecorator = (schema, metadata) => withDocs(schema, metadata);
    downgrade:
      steps:
        - "Type the metadata's type as string again; every value the library passes is still 'object'."
  - id: decorator-refuses-non-zod
    symbols: [QuerySchemaFactory]
    upgrade:
      before: |
        // the shipped decorator called .openapi() on whatever it was given
      after: |
        // the shipped decorator throws a named error when it is given anything but a zod schema
        const schemas = QuerySchemaFactory.build({ decorate });
    downgrade:
      steps:
        - "Nothing to restore: the older decorator threw a TypeError ('openapi is not a function') for the same input."
    data: "A second copy of zod in node_modules fails the check. @hono/zod-openapi declares zod as a peer, so a normal install has one copy."
  - id: resolve-model-relations-entry
    symbols: [resolveModelRelations, RepositoryMetadataMixin]
    upgrade:
      before: |
        registry.resolveModelRelations(entry); // a whole IModelRegistryEntry
      after: |
        // non-breaking: any object with schema, relationsResolver and _builtRelations is accepted
        registry.resolveModelRelations({ schema, relationsResolver });
    downgrade:
      steps:
        - "Pass a whole IModelRegistryEntry; it is still accepted."
---

# Changelog - 2026-11-15

## The query schema metadata names its type as 'object'

<Badge type="warning" text="Breaking Change" />

**In one line.** The metadata a query schema carries says `type: 'object'` instead of `string`, and nothing changes at runtime.

## What changed

- **Metadata.** `TSchemaMetadata.type` is `'object'`, the only value the library ever passes.
- **Decorator.** The decorator that adds OpenAPI metadata to the query schemas throws a named error for a value that is not a zod schema, instead of a `TypeError`.
- **Registry.** `resolveModelRelations` takes the fields it reads (`schema`, `relationsResolver`, `_builtRelations`); a full entry still fits.

## Who is affected

- **Code that writes its own `TSchemaDecorator` and assigns `metadata.type` to another string, or builds its own `TSchemaMetadata`.** See the migration above.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> This is a type-level break. The typecheck names each line.

**Before:**

```typescript
const metadata: TSchemaMetadata = { type: 'string' };
```

**After:**

```typescript
const metadata: TSchemaMetadata = { type: 'object' };
```
