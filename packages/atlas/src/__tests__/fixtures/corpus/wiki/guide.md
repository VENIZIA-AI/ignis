---
title: Artifact registration guide
description: How artifacts are registered and verified during boot.
---

# Artifact registration guide

This guide walks through how a decorated class becomes a container binding, and how to verify
every binding resolves before the application starts serving traffic.

## Registering artifacts

`ignis-artifacts generate` scans every stereotype-decorated class and writes the result to
`src/generated/artifacts.ts`. The application passes that object as `configs.artifacts`, and the
`registerArtifacts` boot step calls `dataSource()`, `component()`, `repository()`, `service()` and
`controller()` for each entry, exactly as a hand-written `preConfigure()` would.

A generated index can be inspected without running the application:

```text
## not a heading
This line lives inside a fenced block, so the chunker must not treat it as a section boundary.
```

Nothing downstream can tell which path registered a class.

## Symbols and lookups

Every binding can be checked with a runtime lookup before boot fails silently. The verification
step reads `bootChecks.binding` from the application configuration and resolves every artifact
listed in the generated index, collecting every broken key instead of stopping at the first one.

### Resolving bindings

A key resolves in three steps: the container looks up the binding, instantiates it if it is a
class binding, and caches the instance when the scope is singleton. A missing binding surfaces in
the same pass that `doVerify` runs, so a broken wire-up fails at boot instead of at first request.

## See also

See the index.
