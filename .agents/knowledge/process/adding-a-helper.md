---
type: Playbook
title: Adding a helper
description: Ordered steps to add a new helper module under packages/helpers/src/modules.
resource: packages/helpers/src/modules
tags: [process, helper, helpers]
---

## Steps

1. Create a directory under `packages/helpers/src/modules/<name>/`. Simple modules are a flat
   `helper.ts` + `index.ts` (see `storage/disk/`); modules with several variants split into
   subdirectories with a shared `base.ts` (see `storage/base.ts` backing `disk/`, `minio/`,
   `bun-s3/`, `in-memory/`) or a shared `common/` for types/constants/interfaces (see `redis/common/`).
2. The helper class extends `BaseHelper` (`packages/helpers/src/modules/base.ts`). Call `super({
   scope: options.scope ?? YourHelper.name, identifier: options.identifier ?? YourHelper.name })`
   in the constructor - this is what sets up `this.logger` as a scoped `Logger`.
3. Log through the scoped logger, not `console`: `this.logger.for('methodName').debug(...)` /
   `.info(...)` / `.warn(...)` / `.error(...)`. The scope-per-call pattern (`for(this.methodName.name)`
   or a literal method name) is what makes log lines traceable back to the call site; see
   `redis/base/abstract.helper.ts` and `storage/base.ts` for the real pattern.
4. Constructor and public methods take an options object (`fn(opts: { key: string })`, never
   `fn(key: string)`), matching every other helper in the package.
5. `protected` members are fine on a normally-declared, named, exported class (see `MinioHelper`'s
   `protected writeObject(...)` and `protected get defaultLinkPrefix()`). They are NOT fine on
   `BaseHelper` itself, or on any class built as an anonymous class expression (e.g. returned
   inline from a factory function) - TypeScript cannot emit a protected/private member in the
   declaration file of an exported ANONYMOUS class (error TS4094), and factory-built classes are
   exactly that shape. If your helper is built through a factory, keep it `public` or hoist the
   logic to a standalone function instead (see the comment on `voidExecution` in
   `packages/helpers/src/utilities/promise.utility.ts` for the exact rationale).
6. Export the new module from `packages/helpers/src/modules/index.ts` (`export * from
   './<name>'`) only if it has NO heavy optional peer dependency. If it wraps an optional peer
   (a driver, SDK, or protocol client not everyone needs), give it its OWN sub-path export instead
   of adding it to the barrel - see how `./cron`, `./bullmq`, `./mqtt`, `./kafka`, `./minio`,
   `./bun-s3`, `./socket-io`, `./axios` are each wired in `packages/helpers/package.json` `exports`,
   each pointing at that module's own `dist/modules/.../index.d.ts` + `.js`.
7. If you added a sub-path export, also add the peer package to `peerDependencies` AND to
   `peerDependenciesMeta.<pkg>.optional: true` in `packages/helpers/package.json`, plus to
   `devDependencies` so it's available for local builds/tests. This is what keeps consumers who
   don't need that driver from being forced to install it.
8. Write tests under `src/__tests__/<name>/` as `*.test.ts`. `bun test` runs these directly from
   `src` for `helpers` (no `test` script needed in `package.json`) - see
   [testing](/process/testing.md).
9. Build with `bun run rebuild` in `packages/helpers`, or `make helpers` for the full dependency
   chain. Remember: a type error in your new module's test file fails the WHOLE package's build,
   not just the test (see [build system](/process/build-system.md)).

## Related

- [Testing](/process/testing.md)
- [Build system](/process/build-system.md)
- [helpers package](/packages/helpers.md)
- [Reference: helpers](/reference/helpers.md)
