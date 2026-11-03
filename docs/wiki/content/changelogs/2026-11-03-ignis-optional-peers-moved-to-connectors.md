---
title: The database and search driver peers move from @venizia/ignis to @venizia/ignis-connectors
description: "@venizia/ignis no longer declares pg, postgres, @electric-sql/pglite, @libsql/client, meilisearch or typesense as optional peers; @venizia/ignis-connectors declares them, so list the driver you use in your own dependencies."
packages: ['@venizia/ignis', '@venizia/ignis-connectors']
---

# Changelog - 2026-11-03

## The driver peers move from @venizia/ignis to @venizia/ignis-connectors

<Badge type="warning" text="Behavior Change" />

**In one line.** `@venizia/ignis` no longer declares the six database and search drivers as optional peers; add the driver you use to your own `dependencies`, at a range `@venizia/ignis-connectors` accepts.

## What changed

- **Six optional peers are removed from `@venizia/ignis`:** `pg`, `postgres`, `@electric-sql/pglite`, `@libsql/client`, `meilisearch` and `typesense`, with their `peerDependenciesMeta` entries. The 13 connector sub-paths that needed them are gone too (see [the connector sub-paths entry](/changelogs/2026-11-02-connector-subpaths-of-ignis-are-removed)).
- **`@venizia/ignis-connectors` declares the same six, with the same ranges, as optional peers.** `pg ^8.23.1`, `postgres ^3.4.9`, `@electric-sql/pglite ^0.5.10`, `@libsql/client ^0.17.4`, `meilisearch ^0.62.0` and `typesense ^3.2.0`. Nothing changed in its `package.json` in this release.
- **`@venizia/ignis` still depends on `@venizia/ignis-connectors`,** pinned to the exact version it was released with, so the connectors are installed with it.

## Who is affected

- **Apps that use a driver and relied on `@venizia/ignis` to name it.** Peers are optional, so no package manager installed the driver for you before, and none does now. What changes is which package declares it: the peer-dependency report and any `peerDependencies` check now name `@venizia/ignis-connectors`.
- **Tooling that reads the `peerDependencies` of `@venizia/ignis`** to decide which drivers an app needs. Read those of `@venizia/ignis-connectors`.
- **Everyone else.** No action needed.

## Details

Add the driver you use, at a range the connectors accept, to your own `package.json`:

```json
{
  "dependencies": {
    "@venizia/ignis": "0.4.7-6",
    "@venizia/ignis-connectors": "0.4.7-5",
    "pg": "^8.23.1"
  }
}
```
