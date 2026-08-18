---
type: Convention
title: Testing conventions
description: Bun test runner only, protected members via bracket notation, tests live under __tests__.
resource: packages/core-server/src/__tests__
tags: [conventions, testing]
---

IGNIS tests run exclusively on the **Bun test runner**. Never Jest, Vitest, or Mocha - no
`describe`/`it` shims from another framework, no config for another runner.

## Layout

Tests live under a package's `src/__tests__/`, mirroring the module structure they exercise.
`packages/core-server/src/__tests__/` has one directory per subsystem: `applications/`, `datasources/`,
`repositories/`, `controllers/`, `connectors/`, `middlewares/`, `authorize/`, `authenticate/`,
`grpc/`, `websocket/`, `metadata/`, and more. `packages/helpers/src/__tests__/` does the same per
helper module: `redis/`, `queue/`, `crypto/`, `storage/`, `network/`, `error/`, `uid/`, `cron/`,
`kafka/`, `socket/`, `websocket/`, `worker-thread/`, `pool/`, `env/`, `logger/`, `utilities/`.

## Accessing protected members

Tests reach protected/private members through bracket notation rather than casting or exposing
them publicly:

```typescript
// packages/core-server/src/__tests__/datasources/raw-client-slot.test.ts
const driver = dataSource['resolveDriver']();
```

```typescript
// packages/core-server/src/__tests__/mail/executors.test.ts
expect(executor['delayedJobs'].size).toBe(1);
```

## Tests gate the whole package build

The build's type-check gate runs against `tsconfig.json`, which includes `src/__tests__`. One
broken test file - even someone else's in-progress, untracked one - fails the build for the
**entire package**, even though the emit step reads `tsconfig.build.json` and keeps tests out of
`dist/`. Before trusting a red build here, check `git status` for untracked test files that might
be the real cause.

That failure no longer costs you the build output: `rebuild.sh` type-checks *before* it runs
`bun run clean`, so a broken test aborts while the last good `dist/` is still in place. The
diagnostic habit still pays off, though. `dist/` is gitignored, so when `bun test` collapses into
import errors, check whether `dist/` is empty first - a fresh clone or worktree shows the identical
symptom for the simpler reason that it has never been built. See
[gotchas](/conventions/gotchas.md) for the full mechanics.

## Related

- [Coding style](/conventions/coding-style.md)
- [Gotchas](/conventions/gotchas.md)
- [Testing process](/process/testing.md)
