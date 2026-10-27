---
title: '@model: type Is Optional, skipMigrate Becomes migration.use'
description: '@model({ type }) is optional and typed by ModelTypes. skipMigrate is replaced by migration: { use }, kept for one release with a boot warning. devz codemod model-settings rewrites skipMigrate.'
packages: ['@venizia/ignis-kernel', '@venizia/ignis', '@venizia/dev-configs']
---

# Changelog - 2026-10-26

## `type` is optional, `skipMigrate` becomes `migration.use`

<Badge type="tip" text="Enhancement" />
<Badge type="warning" text="Deprecation" />

**In one line.** Drop `type: 'entity'` from `@model`: it is optional now. Replace `skipMigrate: true` with `migration: { use: false }`; the old key still works in this release and warns at boot.

## What changed

- **`type` is optional.** `ModelTypes.ENTITY` (`'entity'`) is the only value and the default. The decorator throws on any other value, `'view'` included: views are not in the relational query interface, and nothing in IGNIS ever read the field.
- **`ModelTypes` and `TModelType`** are exported from the kernel package, like the other constant classes.
- **`migration: { use }` replaces `skipMigrate`.** `use` defaults to `true`. `false` marks the model as one your migration tooling leaves alone.
- **IGNIS generates no migrations.** `drizzle-kit` reads the schema file you give it; neither `type` nor `migration` changes what it does. `migration.use` is a marker in the public registry (`MetadataRegistry.getAllModels()`) for tooling of yours. See [Migrations](/guides/core-concepts/persistent/models#migrations).
- **`skipMigrate` is deprecated.** The decorator maps it to `migration: { use: !skipMigrate }` and the application logs one warning per model at boot:

```text
[deprecated] model Product uses skipMigrate | use migration: { use: false } instead | removed in 0.4.4
```

- **Both keys together throw.** A model that sets `skipMigrate` and `migration` is ambiguous, so the decorator refuses it.
- **`BaseMetaLinkModel` uses `migration: { use: false }`.** The MetaLink docs now say what is true: IGNIS creates no table, so export its schema to your `drizzle-kit` file or create it by hand.

## Who is affected

| You wrote                        | Now                                                      |
| -------------------------------- | -------------------------------------------------------- |
| `@model({ type: 'entity' })`     | Works. `type` can be removed.                            |
| `@model({ type: 'view' })`       | Throws. Views were never supported.                      |
| `@model({ skipMigrate: true })`  | Works, warns at boot. Write `migration: { use: false }`. |
| `@model({ skipMigrate: false })` | Works, warns at boot. Remove the key.                    |

## Migrate

```bash
bunx devz codemod model-settings           # dry run: lists the files that would change, writes nothing
bunx devz codemod model-settings --write   # rewrites them
bunx devz codemod model-settings --check   # dry run that exits 1 if anything would change (CI)
```

The codemod turns `skipMigrate: true` into `migration: { use: false }` and removes `skipMigrate: false`. It leaves a value it cannot read for sure (a variable, a shorthand, a model that already has `migration`) and prints its file and line. Removing `type: 'entity'` is optional and left to you.
