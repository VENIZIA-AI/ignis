---
title: ignis-artifacts Finds Decorators Another Package Re-Exports
description: 'A repeatable --source-module flag lets ignis-artifacts index classes whose stereotype decorators come from a package that re-exports them, such as a frontend framework built on the kernel.'
packages: ['@venizia/ignis-boot']
---

# Changelog - 2026-10-17

## ignis-artifacts finds decorators another package re-exports

<Badge type="tip" text="Enhancement" />

**In one line.** `ignis-artifacts generate --source-module <package>` indexes classes decorated with stereotypes that `<package>` re-exports from the kernel.

## What changed

- **`--source-module <specifier>`.** The scanner used to count `@service`, `@repository` and the other stereotypes only when they were imported from `@venizia/ignis` or `@venizia/ignis-kernel`. Each `--source-module` adds one more module, matched exactly. Repeat the flag for several.
- **The header records it.** The generated file's first line names every `--source-module`, so the regenerate command stays complete.
- **The stale hint prints the whole command.** `check` used to suggest `--root` and `--out` only. It now prints the full `generate` command, with `--ignore`, `--export` and `--source-module` included.
- **Programmatic API.** `IGenerateOptions` and the scanner's options take `sourceModules?: string[]`. `ArtifactIndexEmitter.renderCommand()` returns the command the header and the hint print.

## Who is affected

- **Backend applications on `@venizia/ignis`.** No action needed. Without the flag, the scan, the header and the index are unchanged.
- **Applications whose decorators come from another package.** Pass that package with `--source-module`, to both `generate` and `check`, and drop any hand-written side-effect imports.

## Details

A frontend framework built on the kernel re-exports its stereotype decorators, so its classes import `service` from the framework, not from `@venizia/ignis-kernel`. Before this flag the scanner found none of them:

```json
{
  "scripts": {
    "generate:artifacts": "ignis-artifacts generate --root src --out src/_artifacts.ts --source-module @acme/frontend --source-module @acme/frontend-kernel",
    "check:artifacts": "ignis-artifacts check --root src --out src/_artifacts.ts --source-module @acme/frontend --source-module @acme/frontend-kernel"
  }
}
```

- A specifier is matched whole: `--source-module @acme/frontend` does not match `@acme/frontend-kernel`.
- `check` compares the index body only, so it needs the same `--source-module` set as `generate`. A set that differs finds different classes and reports the file stale.
- IGNIS names no consumer package. The default stays `@venizia/ignis` and `@venizia/ignis-kernel`.

**Files:** [`packages/boot/src/clis/artifacts.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/clis/artifacts.ts), [`packages/boot/src/generator/scanner.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/generator/scanner.ts), [`packages/boot/src/generator/emitter.ts`](https://github.com/VENIZIA-AI/ignis/blob/develop/packages/boot/src/generator/emitter.ts)
