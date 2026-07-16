---
okf_version: "0.1"
title: IGNIS knowledge bundle
description: The curated, agent-facing source of truth for the IGNIS framework.
---

# IGNIS knowledge

Curated knowledge about the IGNIS framework, for agents and for humans. Start here rather than
re-deriving the project from the source each session.

**The code is ground truth.** These concepts are curated prose over the code. When the two disagree,
the code wins and the concept is a bug - fix it and note it in [log](/log.md).

Served over MCP as `ignis-knowledge`: use `okf_search` to find a concept, `okf_list_concepts` to
browse by type, `okf_get_concept` to read one.

## Start here

| Concept | What it answers |
|---|---|
| [What is IGNIS](/overview/what-is-ignis.md) | What this is and why it exists |
| [Onboarding](/overview/onboarding.md) | First day here, in order |
| [Monorepo layout](/overview/monorepo-layout.md) | What lives where |
| [Build, run, test](/overview/build-run-test.md) | How to actually run things |
| [Design decisions](/overview/design-decisions.md) | The non-obvious choices, and why |
| [Gotchas](/conventions/gotchas.md) | The traps that cost real time |

## Packages

The framework ships five packages, built in dependency order.

| Package | Role |
|---|---|
| [core](/packages/core.md) | The framework: application, controllers, repositories, connectors, components |
| [boot](/packages/boot.md) | Convention-based auto-discovery and bootstrapping |
| [inversion](/packages/inversion.md) | The standalone IoC container |
| [helpers](/packages/helpers.md) | Production utility modules |
| [dev-configs](/packages/dev-configs.md) | Shared ESLint, Prettier, and TypeScript config |

## Architecture

How the pieces fit.

- [DI container](/architecture/di-container.md) - bindings, scopes, injection rules
- [Application lifecycle](/architecture/application-lifecycle.md) - the startup sequence
- [Boot lifecycle](/architecture/boot-lifecycle.md) - configure, discover, load
- [Component model](/architecture/component-model.md) - what a component is and how it wires
- [Controller system](/architecture/controller-system.md) - the route APIs over Hono
- [Repository hierarchy](/architecture/repository-hierarchy.md) - abstract to CRUD, plus mixins
- [DataSource hierarchy](/architecture/datasource-hierarchy.md) - the connector and driver seams
- [Transactions](/architecture/transactions.md) - commit, rollback, and connection safety
- [Filter system](/architecture/filter-system.md) - operators, JSON paths, the dual query API
- [Typesense search connector](/architecture/search-typesense.md) - the search branch
- [Authentication](/architecture/authentication.md) - strategies and the token seam
- [Casbin authorization](/architecture/authorization-casbin.md) - scoped RBAC
- [Error handling flow](/architecture/error-handling-flow.md) - throw to HTTP response

## Conventions

How the code is written. Read before writing any.

- [Options objects](/conventions/options-objects.md)
- [Coding style](/conventions/coding-style.md)
- [Error handling](/conventions/error-handling.md)
- [Const classes](/conventions/const-classes.md)
- [Binding key namespaces](/conventions/binding-key-namespaces.md)
- [Testing conventions](/conventions/testing-conventions.md)
- [Docs writing style](/conventions/docs-writing-style.md)
- [Gotchas](/conventions/gotchas.md)

## Process

How the work gets done.

- [Build system](/process/build-system.md)
- [Testing](/process/testing.md)
- [Debugging](/process/debugging.md)
- [Git workflow](/process/git-workflow.md)
- [Release and publish](/process/release-publish.md)
- [Adding a component](/process/adding-a-component.md)
- [Adding a helper](/process/adding-a-helper.md)
- [Updating the wiki](/process/updating-the-wiki.md)

## Examples

Runnable apps. [vert](/examples/vert.md) is the production-grade reference implementation;
[5-mins-qs](/examples/5-mins-qs.md) is the smallest thing that runs.

[vert](/examples/vert.md) ·
[rpc-api-server](/examples/rpc-api-server.md) ·
[rpc-client-app](/examples/rpc-client-app.md) ·
[5-mins-qs](/examples/5-mins-qs.md) ·
[grpc-test](/examples/grpc-test.md) ·
[socket-io-test](/examples/socket-io-test.md) ·
[websocket-test](/examples/websocket-test.md) ·
[supabase](/examples/supabase.md) ·
[typesense-search](/examples/typesense-search.md)

## Reference

Curated lookups:

- [Glossary](/reference/glossary.md) - the vocabulary
- [Key source files](/reference/key-source-files.md) - where to look first
- [External links](/reference/external-links.md) - npm, wiki, upstream docs

Generated from source - never hand-edited, run `make okf-gen`:

- [Source map](/reference/source-map.md) - subsystems and file counts
- [Components catalog](/reference/components.md)
- [Helpers catalog](/reference/helpers.md)
- [Binding keys](/reference/binding-keys.md)
- [Makefile targets](/reference/makefile-targets.md)

## Maintaining this bundle

Change a fact in the code, update its concept in the same change, and append to [log](/log.md).
A bundle that drifts is worse than none, because it is believed.

`make okf-check` validates it: frontmatter, links, docs style, one concept per package and example,
and freshness of everything generated. `make okf-coverage` reports the gaps. Neither is a commit
gate - the bundle is re-verified against the code by running knowledge sync periodically.
