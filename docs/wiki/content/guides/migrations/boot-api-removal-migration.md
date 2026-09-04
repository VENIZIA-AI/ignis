# Upgrading past the runtime boot removal (ignis 0.2.0-13 to the next release)

> **Audience:** the team maintaining **nx-seller** (BANA), or any application still on `@venizia/ignis` 0.2.0-13. One upgrade of the whole `@venizia/*` chain brings three changes at once: artifacts register from a generated index, the runtime boot API is gone, and the framework's `zod` moved to 4.4. This page lists exactly what stops compiling and the order to fix it.

## What breaks, measured against nx-seller

| Symptom after `bun install` | Where | Fix |
|---|---|---|
| `TS4113` - `boot` does not exist in the base class | 16 files: `nx-seller/packages/{commerce,finance,helpdesk,identity,inventory,invoice,ledger,licensing,outreach,payment,pricing,sale,search,signal,taxation}/src/application.ts` and `nx-seller/packages/search/src/migrations/bootstrap.ts` | delete the whole `override async boot()` method (none of them calls `super.boot()`) |
| `TS2339` - property `boot` does not exist | `nx-seller/packages/search/src/migrations/bootstrap.ts` (line 104), `nx-seller/packages/core/src/helpers/bootstraps/worker.ts` (34), `nx-seller/packages/core/src/helpers/bootstraps/migration.ts` (31) | delete the `await app.boot();` line; `initialize()` and `start()` are unchanged |
| still compiles, ignored | `bootOptions` keys in `nx-seller/packages/core/src/common/app-config.ts` and `.../bootstraps/migration.ts` | delete the key |
| duplicate `zod` types | any schema passed into `@venizia/ignis` | raise the root `overrides.zod` to `^4.4.3` |

Nothing else in the public API that nx-seller uses changed shape. The full diff is in the IGNIS release audit; the two changelogs behind it are [Artifacts register from a generated index](/changelogs/2026-09-02-decorator-artifact-registration) and [The deprecated boot API is removed](/changelogs/2026-09-03-deprecated-boot-api-removed).

## Step 1 - pin the new versions

In the root `package.json` `overrides`, replace the six `@venizia/*` versions with the ones the IGNIS release printed, and set `"zod": "^4.4.3"`. Then:

```bash
bun install
```

## Step 2 - register artifacts from a generated index

Each application that still lists its artifacts by hand follows the [bootstrapping guide](/guides/core-concepts/application/bootstrapping):

1. Add `@venizia/ignis-boot` as a devDependency and the two scripts:

```json
"generate:artifacts": "ignis-artifacts generate --root src --out src/generated/artifacts.ts",
"check:artifacts": "ignis-artifacts check --root src --out src/generated/artifacts.ts"
```

2. Put `@service()` on services and `@component()` on components.
3. Run `bun run generate:artifacts` and commit `src/generated/artifacts.ts`.
4. Set `artifacts: GeneratedArtifacts` in the application config.

An application that keeps registering by hand in `preConfigure()` still works. Only the boot code below has to go.

## Step 3 - delete the boot code

```bash
grep -rn "override async boot\|\.boot()\|bootOptions" packages apps --include='*.ts' | grep -v node_modules
```

Delete every hit: the 16 override methods, the 3 `await app.boot()` lines, the 2 `bootOptions` keys. Start with `await application.start()` where the chain used to be `boot()` then `start()`.

## Step 4 - verify

```bash
bun run --filter '*' tsc --noEmit
```

Zero errors means the upgrade is complete. A `TS2307` on `@venizia/ignis-boot` at this point means a runtime-boot import survived (`Bootstrapper`, `BootMixin`, a `*Booter` class, `discoverFiles`, `loadClasses`) - those exports no longer exist and have no replacement; the generated index does their job.

## Why the boot API went away

The file-glob boot discovered artifacts at runtime, which cannot work inside `bun build --compile`. The generated index is read at build time, so a compiled binary and a `bun run` start register the same artifacts. Details live in the [artifact registration reference](/references/base/bootstrapping).
