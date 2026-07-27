---
type: Convention
title: Testing conventions
description: Bun test runner only, protected members via bracket notation, tests live under __tests__.
resource: packages/core/src/__tests__
tags: [conventions, testing]
---

IGNIS tests run exclusively on the **Bun test runner**. Never Jest, Vitest, or Mocha - no
`describe`/`it` shims from another framework, no config for another runner.

## Layout

Tests live under a package's `src/__tests__/`, mirroring the module structure they exercise.
`packages/core/src/__tests__/` has one directory per subsystem: `applications/`, `datasources/`,
`repositories/`, `controllers/`, `connectors/`, `middlewares/`, `authorize/`, `authenticate/`,
`grpc/`, `websocket/`, `metadata/`, and more. `packages/helpers/src/__tests__/` does the same per
helper module: `redis/`, `queue/`, `crypto/`, `storage/`, `network/`, `error/`, `uid/`, `cron/`,
`kafka/`, `socket/`, `websocket/`, `worker-thread/`, `pool/`, `env/`, `logger/`, `utilities/`.

## Accessing protected members

Tests reach protected/private members through bracket notation rather than casting or exposing
them publicly:

```typescript
// packages/core/src/__tests__/datasources/raw-client-slot.test.ts
const driver = dataSource['resolveDriver']();
```

```typescript
// packages/core/src/__tests__/mail/executors.test.ts
expect(executor['delayedJobs'].size).toBe(1);
```

## The dist-emptying gotcha

The helpers build compiles `src/` (which includes `src/__tests__`) with `noEmitOnError: true` set
in the shared `tsconfig.base.json`. One broken test file - even someone else's in-progress,
untracked file - blocks emission for the **entire package**, leaving `dist/` empty. Since `dist/`
is gitignored, this looks unrelated to whatever you were actually testing: `bun test` starts
failing with import errors because the package now resolves to an empty build. Before trusting a
red build here, check `git status` for untracked test files that might be the real cause. See
[gotchas](/conventions/gotchas.md) for the full mechanics and the fixed-state build.sh behavior.

## Related

- [Coding style](/conventions/coding-style.md)
- [Gotchas](/conventions/gotchas.md)
- [Testing process](/process/testing.md)
