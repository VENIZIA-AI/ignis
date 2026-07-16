---
title: Kafka - Compiling to a Single Binary
description: The platformaticWasmPlugin() Bun bundler plugin required when compiling an app that imports a Kafka helper
difficulty: advanced
---

# Compiling to a Single Binary

This page covers `platformaticWasmPlugin()`, the Bun bundler plugin required when compiling an application that imports any Kafka helper into a standalone `bun build --compile` executable.

## The problem

- **A compiled binary crashes on startup** if the application imports any Kafka helper and the build did not register the plugin:

  ```
  ENOENT: no such file or directory, open '/$bunfs/dist/native.wasm'
  ```

- **The crash happens before your code runs.** It fires while the module graph is still loading - before the IGNIS application boots, so no log line, no lifecycle hook, and no error handler of yours ever executes.

## Why it happens

- **The codecs are WebAssembly, not native bindings.** `@platformatic/kafka` computes Kafka's CRC32C checksums and lz4/snappy compression in WebAssembly, through `@platformatic/wasm-utils`.
- **The default entrypoint reads the wasm payload from disk** at module load time:

  ```javascript
  // @platformatic/wasm-utils/dist/index.js
  const wasm = readFileSync(new URL('../dist/native.wasm', import.meta.url));
  ```

- **`bun build --compile` embeds JavaScript modules only.** Assets such as `native.wasm` are never carried into the executable. Inside the binary, `import.meta.url` resolves against the virtual `/$bunfs` filesystem, the file isn't there, and the read throws.
- **Running from source is unaffected.** `bun run` / `bun .` keep `node_modules` on disk, so the read succeeds - the bug only exists in compiled binaries.

## The fix

- **A second entrypoint ships the payload inline.** `@platformatic/wasm-utils/bundled` exposes the same API with the wasm payload inlined as base64 - no filesystem read.
- **`platformaticWasmPlugin()` swaps one entrypoint for the other** at bundle time, so the rest of your code and `@platformatic/kafka` itself need no changes.
- **Compile through a Bun build script, not the CLI.** `bun build --compile` on the command line cannot register plugins:

```typescript
// scripts/compile.ts
import { platformaticWasmPlugin } from '@venizia/ignis-helpers/kafka';

const built = await Bun.build({
  entrypoints: ['./dist/index.js'],
  target: 'bun',
  minify: { whitespace: true, syntax: true },
  sourcemap: 'linked',
  compile: {
    target: process.env.BUN_TARGET ?? 'bun-linux-x64',
    outfile: './dist/bin',
  },
  plugins: [platformaticWasmPlugin()],
});

if (!built.success) {
  console.error(built.logs);
  process.exit(1);
}
```

```json
{
  "scripts": {
    "compile": "bun run ./scripts/compile.ts"
  }
}
```

- **The plugin resolves relative to the importing module's own directory** (`Bun.resolveSync` from `dirname(args.importer)`), so it works with hoisted and isolated `node_modules` layouts alike, and pins no package version.

## Verifying

A correctly built binary contains no reference to the wasm file on disk:

```bash
grep -c 'native.wasm' ./dist/bin   # 0 -- the payload is inlined
./dist/bin                         # boots instead of throwing ENOENT
```

The binary grows by roughly 76 KB, the base64 form of the 57 KB wasm module.

## Notes

- **Upgrading `@platformatic/kafka` does not remove the need for the plugin.** Every release to date imports the default `@platformatic/wasm-utils` entrypoint.
- **Apps that never import a Kafka helper need no plugin.** Nothing pulls in `@platformatic/wasm-utils`, and the plugin's resolver never fires.
- **Patching `node_modules` during the build achieves the same result**, but mutates a dependency in place, pins the store path to one version, and leaves the tree dirty when a build fails. The plugin needs neither.

## See also

- [Kafka Overview](./) - the four helpers this plugin protects
- [Producer](./producer) / [Consumer](./consumer) / [Admin](./admin) - any of these importing into a compiled binary triggers this caveat
- [Examples & Troubleshooting](./examples) - other Kafka connection and configuration errors

**Files:**

- [`packages/helpers/src/modules/queue/kafka/bundler/platformatic-wasm.plugin.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/bundler/platformatic-wasm.plugin.ts) - `platformaticWasmPlugin`
- [`packages/helpers/src/modules/queue/kafka/bundler/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/bundler/common/constants.ts) - `KafkaBundlerPluginNames`, `PlatformaticWasmSpecifiers`
