# Compiling to a Single Binary

`bun build --compile` produces a standalone executable that crashes on startup when the application
imports any Kafka helper, unless the build registers `platformaticWasmPlugin`.

```
ENOENT: no such file or directory, open '/$bunfs/dist/native.wasm'
```

The failure happens while the module graph is still loading -- before the IGNIS application boots, so
no log line, no lifecycle hook, and no error handler of yours ever runs.

## Why it happens

`@platformatic/kafka` computes Kafka's CRC32C checksums and lz4/snappy compression in WebAssembly,
through `@platformatic/wasm-utils`. The default entrypoint of that package reads the wasm payload
from disk at module load time:

```javascript
// @platformatic/wasm-utils/dist/index.js
const wasm = readFileSync(new URL('../dist/native.wasm', import.meta.url));
```

`bun build --compile` embeds JavaScript modules only -- assets such as `native.wasm` are not carried
into the executable. Inside the binary, `import.meta.url` resolves against the virtual `/$bunfs`
filesystem, the file is not there, and the read throws.

Running from source (`bun run`, `bun .`) is unaffected: `node_modules` is on disk, so the read
succeeds. The bug only exists in compiled binaries.

## The fix

`@platformatic/wasm-utils` ships a second entrypoint, `@platformatic/wasm-utils/bundled`, exposing
the same API with the wasm payload inlined as base64 -- no filesystem read. `platformaticWasmPlugin`
swaps one entrypoint for the other at bundle time.

Compile through a Bun build script instead of the `bun build --compile` CLI, which cannot register
plugins:

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

The plugin resolves `@platformatic/wasm-utils/bundled` from the importing module's own directory, so
it works with hoisted and isolated `node_modules` layouts alike, and pins no package version.

## Verifying

A correctly built binary contains no reference to the wasm file on disk:

```bash
grep -c 'native.wasm' ./dist/bin   # 0 -- the payload is inlined
./dist/bin                         # boots instead of throwing ENOENT
```

The binary grows by roughly 76 KB, the base64 form of the 57 KB wasm module.

## Notes

- Upgrading `@platformatic/kafka` does not remove the need for the plugin: every release to date,
  including 2.6.1, imports the default `@platformatic/wasm-utils` entrypoint.
- Applications that never import a Kafka helper need no plugin -- nothing pulls in
  `@platformatic/wasm-utils`, and the plugin's resolver never fires.
- Patching `node_modules` during the build achieves the same result, but mutates a dependency in
  place, pins the store path to one version, and leaves the tree dirty when a build fails. The
  plugin needs neither.
