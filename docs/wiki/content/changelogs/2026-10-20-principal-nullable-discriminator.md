---
title: isNullableDiscriminator for the Principal Enricher
description: 'generatePrincipalColumnDefs takes isNullableDiscriminator; false makes the type column NOT NULL. The default keeps it nullable.'
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-20

## isNullableDiscriminator for the principal enricher

<Badge type="tip" text="New Feature" />

**In one line.** A polymorphic principal's type column can now be `NOT NULL`, so a row cannot name an id without saying what the id belongs to.

```typescript
generatePrincipalColumnDefs({
  polymorphicIdType: 'number',
  defaultPolymorphic: 'User',
  isNullableDiscriminator: false,
});
// principalType: text('principal_type').default('User').notNull()
```

## What changed

- **New option `isNullableDiscriminator`.** It sits next to `isNullableId` in `TPrincipalEnricherOptions`, on both the Postgres and the SQLite `generatePrincipalColumnDefs`.
- **The default is `true`.** The `{discriminator}Type` column stays nullable, as it always was, so existing schemas and migrations do not change.
- **`false` adds `NOT NULL`.** The column keeps its default value (`defaultPolymorphic`, `''` if omitted). The return type follows: the column is `NotNull<HasDefault<...>>`.
- **The id column is separate.** `isNullableId` still controls only `{discriminator}Id`.

## Who is affected

- **Everyone not setting the option.** Nothing changes.
- **A model that wants the type column required.** Pass `isNullableDiscriminator: false` and generate a migration.
- **A caller of `enrichPrincipal`.** Its options type is not generic, so it takes the default (`true`) only. Spread `generatePrincipalColumnDefs` into the table to set `false`.
