import { getError } from '@/modules/error';
import type { BunPlugin } from 'bun';
import { dirname } from 'node:path';
import { KafkaBundlerPluginNames, PlatformaticWasmSpecifiers } from './common';

/**
 * platformaticWasmPlugin — Bun bundler plugin required to compile applications using the Kafka helpers.
 *
 * `@platformatic/kafka` reaches Kafka's CRC32C and compression codecs through
 * `@platformatic/wasm-utils`, whose default entrypoint reads `native.wasm` from disk at module load
 * time. `bun build --compile` embeds JavaScript only, so that read resolves against `/$bunfs` and the
 * binary dies with ENOENT before reaching the application. The `/bundled` entrypoint exposes the same
 * API with the wasm payload inlined; this plugin swaps one for the other at bundle time.
 */
export const platformaticWasmPlugin = (): BunPlugin => ({
  name: KafkaBundlerPluginNames.PLATFORMATIC_WASM,
  setup(build) {
    build.onResolve({ filter: PlatformaticWasmSpecifiers.ENTRYPOINT_FILTER }, args => {
      try {
        return {
          path: Bun.resolveSync(
            PlatformaticWasmSpecifiers.BUNDLED_ENTRYPOINT,
            dirname(args.importer),
          ),
        };
      } catch (error) {
        throw getError({
          message: [
            `[platformaticWasmPlugin] Failed to resolve ${PlatformaticWasmSpecifiers.BUNDLED_ENTRYPOINT}`,
            `from ${args.importer}`,
            `| Error: ${error instanceof Error ? error.message : String(error)}`,
          ].join(' '),
        });
      }
    });
  },
});
