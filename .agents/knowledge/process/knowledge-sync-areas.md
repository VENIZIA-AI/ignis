---
type: Playbook
title: Knowledge-sync area map
description: Which concepts the knowledge-sync skill verifies when an area of IGNIS's code changes.
resource: packages
tags: [process, knowledge, knowledge-sync]
---

VULCAN's shipped `knowledge-sync` skill reads this file through `knowledge.syncAreas` in
`.configs/vulcan.config.ts` and builds one verifier target per changed code area. Extend it when a new
area appears, and keep it in step with the concepts it names.

| Changed area | Concepts to verify (under `.agents/knowledge/`) |
|---|---|
| `packages/core-server/src/base/applications` | architecture/application-lifecycle, packages/core-server |
| `packages/core-server/src/components` | architecture/component-model, architecture/controller-system, architecture/authentication, architecture/authorization-casbin, process/adding-a-component |
| `packages/kernel/src/base/repositories`, `packages/kernel/src/base/datasources` | architecture/repository-hierarchy, architecture/datasource-hierarchy, architecture/transactions, packages/kernel |
| `packages/kernel/src/common/bindings.ts` | conventions/binding-key-namespaces |
| `packages/kernel` (broad/other) | packages/kernel, architecture/di-container, architecture/controller-system, architecture/error-handling-flow |
| `packages/connectors` | packages/connectors, architecture/relational-connector, architecture/sqlite-connector, architecture/search-typesense, architecture/transactions |
| `packages/filter` | packages/filter, architecture/filter-system |
| `packages/core-worker` | packages/core-worker |
| `packages/core-server` (broad/other) | packages/core-server, architecture/error-handling-flow, conventions/gotchas |
| `packages/boot` | packages/boot, architecture/boot-lifecycle |
| `packages/inversion` | packages/inversion, architecture/di-container, conventions/gotchas |
| `packages/helpers` | packages/helpers, conventions/error-handling, process/adding-a-helper |
| `packages/dev-configs` | packages/dev-configs, conventions/coding-style, conventions/testing-conventions |
| `examples/<x>` | examples/&lt;x&gt; |
| `Makefile`, `make/`, `scripts/`, `.githooks/`, root `package.json` | process/build-system, process/testing, process/git-workflow, overview/build-run-test, conventions/gotchas |
| `.github/workflows/` | process/release-publish, process/updating-the-wiki |
| `docs/wiki` | process/updating-the-wiki |
