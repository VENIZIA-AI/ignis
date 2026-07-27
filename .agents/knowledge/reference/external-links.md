---
type: Reference
title: External links
description: Pointers to context that lives outside the repository - packages, the docs wiki, and upstream framework docs.
resource: .
tags: [reference, external-links, npm, docs]
---

## npm packages

Verified against each `packages/*/package.json` `name` field.

| Package | Path |
|---|---|
| `@venizia/ignis` | `packages/core` |
| `@venizia/ignis-boot` | `packages/boot` |
| `@venizia/ignis-helpers` | `packages/helpers` |
| `@venizia/ignis-inversion` | `packages/inversion` |
| `@venizia/dev-configs` | `packages/dev-configs` |

## Docs wiki

| What | URL |
|---|---|
| IGNIS docs (VitePress, built by `.github/workflows/deploy-docs.yml` via `make docs`, deployed to GitHub Pages for `VENIZIA-AI/ignis`) | https://ignis.venizia.ai |

## Upstream framework docs

Only listed where a real dependency exists - verified against `packages/core/package.json` and
`packages/helpers/package.json` (`dependencies`/`peerDependencies`).

| Upstream | Where IGNIS depends on it | Docs |
|---|---|---|
| Hono | `core` and `helpers` runtime dependency - the HTTP engine underneath every Controller | https://hono.dev/docs/ |
| Drizzle ORM | `core` and `helpers` runtime dependency - the ORM behind every relational DataSource/Repository | https://orm.drizzle.team/docs/overview |
| Zod | `inversion` runtime dependency; `core` uses it via `@hono/zod-openapi` for Filter/Model schemas | https://zod.dev/ |
| Casbin | `core` optional peer dependency - the enforcer behind `AuthorizeComponent` | https://casbin.org/docs/overview |
| Bun | primary runtime (`@types/bun` in every package's devDependencies; `RuntimeModules.BUN` branch in `AbstractApplication`) | https://bun.sh/docs |
| BullMQ | `core` and `helpers` optional peer dependency - one of the Queue helper's backends | https://docs.bullmq.io/ |
| Typesense | `core` optional peer dependency - one of the two search connectors | https://typesense.org/docs/ |

## Related

- [What is IGNIS](/overview/what-is-ignis.md)
- [Monorepo layout](/overview/monorepo-layout.md)
- [Search and Typesense](/architecture/search-typesense.md)
- [Authorization (Casbin)](/architecture/authorization-casbin.md)
