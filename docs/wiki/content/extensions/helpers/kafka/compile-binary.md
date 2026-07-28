---
title: Kafka - Compiling to a Single Binary
description: The platformaticKafkaPlugins() Bun bundler plugins required when compiling an app that imports a Kafka helper
difficulty: advanced
---

# Compiling to a Single Binary

`platformaticKafkaPlugins()` returns every Bun bundler plugin `@platformatic/kafka` needs to survive `bun build --compile`. Register them whenever you compile an application that imports a Kafka helper. Skip them, and the binary crashes on its first run.

```typescript
// scripts/compile.ts
import { platformaticKafkaPlugins } from '@venizia/ignis-helpers/kafka';

const built = await Bun.build({
  entrypoints: ['./dist/index.js'],
  target: 'bun',
  minify: { whitespace: true, syntax: true },
  sourcemap: 'linked',
  compile: {
    target: process.env.BUN_TARGET ?? 'bun-linux-x64',
    outfile: './dist/bin',
  },
  plugins: platformaticKafkaPlugins(),
});

if (!built.success) {
  console.error(built.logs);
  process.exit(1);
}
```

`bun build --compile` on the command line cannot register plugins. Compile through a build script instead:

```json
{
  "scripts": {
    "compile": "bun run ./scripts/compile.ts"
  }
}
```

## The two crashes

| Crash | Plugin that prevents it |
|---|---|
| `ENOENT: no such file or directory, open '/$bunfs/dist/native.wasm'` | `platformaticWasmPlugin()` |
| `Cannot find package 'ajv-draft-04' from '/$bunfs/root/index.js'` | `platformaticRequirePlugin()` |

Both fire while the module graph is still loading, before the IGNIS application boots. No log line, no lifecycle hook, and no error handler of yours ever runs.

Running from source is unaffected. `bun run` and `bun .` keep `node_modules` on disk, so both reads succeed. The crashes exist only in compiled binaries.

## Why the wasm read fails

`@platformatic/kafka` computes Kafka's CRC32C checksums and lz4/snappy compression in WebAssembly, through `@platformatic/wasm-utils`. That package reads its payload from disk at module load:

```javascript
// @platformatic/wasm-utils/dist/index.js
const wasm = readFileSync(new URL('../dist/native.wasm', import.meta.url));
```

`bun build --compile` embeds JavaScript modules only. Assets such as `native.wasm` never reach the executable, so `import.meta.url` resolves against the virtual `/$bunfs` filesystem and the read throws.

`platformaticWasmPlugin()` redirects the import to `@platformatic/wasm-utils/bundled`, the same API with the payload inlined as base64.

## Why the package lookup fails

Since 2.8.0, `@platformatic/kafka` resolves two dependencies at module scope through `createRequire`:

```javascript
// @platformatic/kafka/dist/registries/confluent-schema-registry.js
const require = createRequire(import.meta.url);
const AjvDraft04 = require('ajv-draft-04');
const draft06MetaSchema = require('ajv/dist/refs/json-schema-draft-06.json');
```

Three facts make that fatal in a binary:

- **The bundler cannot see through `createRequire`.** Neither module is embedded, and the bare specifier survives verbatim into the binary.
- **The module always loads.** `dist/index.js` re-exports the schema registry, so importing anything from the package runs those two lines. A schema registry you never use still crashes the binary.
- **A compiled binary has no `node_modules`.** `import.meta.url` resolves against `/$bunfs` and the lookup fails.

`platformaticRequirePlugin()` rewrites each module-scope `require()` into a static import at bundle time, so the bundler pulls the module into the binary.

> [!WARNING]
> Installing `ajv-draft-04` as a direct dependency does not fix this. The defect is the resolution mechanism, not a missing package, so the second line fails identically.

## Verifying

```bash
./dist/bin                           # boots instead of crashing
grep -ac 'native.wasm'  ./dist/bin   # 0 - the wasm payload is inlined
grep -ac 'ajv-draft-04' ./dist/bin   # 0 - the package is bundled in
```

The last count is meaningful only for a minified build. An unminified bundle keeps package paths in module comments.

The binary grows by roughly 76 KB for the base64 wasm module, plus the size of the two hoisted packages.

## Notes

- **Register the pair, not the individual plugins.** `platformaticKafkaPlugins()` picks up any future addition without another edit to your compile script. `platformaticWasmPlugin()` and `platformaticRequirePlugin()` stay exported for a build that needs one alone.
- **Upgrading `@platformatic/kafka` does not remove the need for the plugins.** Every release to date imports the default `@platformatic/wasm-utils` entrypoint, and 2.8.0 introduced the `createRequire` calls in a minor release.
- **An unresolvable specifier now fails the build**, with Bun's own resolution error and `built.success === false`. That is the point of hoisting to a static import: you learn at build time instead of on the first run in production.
- **Both plugins resolve relative to the importing module's own directory.** That works with hoisted and isolated `node_modules` layouts alike, and pins no package version.
- **Apps that never import a Kafka helper need no plugins.** Nothing pulls in `@platformatic/wasm-utils` or the schema registry, and neither plugin ever fires.
- **`platformaticRequirePlugin()` skips `protobufjs` and `@node-rs/crc32`.** Both are optional peers of `@platformatic/kafka`, and a static import would break builds that do not install them.
- **Patching `node_modules` during the build achieves the same result, but at a cost.** It mutates a dependency in place, pins the store path to one version, and leaves the tree dirty when a build fails. The plugins need none of that.

## See also

- [Kafka Overview](./) - the four helpers these plugins protect
- [Producer](./producer) / [Consumer](./consumer) / [Admin](./admin) - any of these importing into a compiled binary triggers this caveat
- [Schema Registry](./schema-registry) - the helper that wraps the module the second crash comes from
- [Examples & Troubleshooting](./examples) - other Kafka connection and configuration errors

**Files:**

- [`packages/helpers/src/modules/queue/kafka/bundler/plugins.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/bundler/plugins.ts) - `platformaticKafkaPlugins`
- [`packages/helpers/src/modules/queue/kafka/bundler/platformatic-wasm.plugin.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/bundler/platformatic-wasm.plugin.ts) - `platformaticWasmPlugin`
- [`packages/helpers/src/modules/queue/kafka/bundler/platformatic-require.plugin.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/bundler/platformatic-require.plugin.ts) - `platformaticRequirePlugin`
- [`packages/helpers/src/modules/queue/kafka/bundler/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/bundler/common/constants.ts) - `KafkaBundlerPluginNames`, `PlatformaticWasmSpecifiers`, `PlatformaticRequireSpecifiers`
