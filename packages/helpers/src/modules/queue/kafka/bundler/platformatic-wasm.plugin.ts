import { getError } from '@/modules/error';
import type { BunPlugin } from 'bun';
import { dirname } from 'node:path';
import { KafkaBundlerPluginNames, PlatformaticWasmSpecifiers } from './common';

/**
 * `@platformatic/wasm-utils`'s default entrypoint reads `native.wasm` from disk at module load;
 * `bun build --compile` embeds JS only, so that resolves against `/$bunfs` and the binary dies
 * with ENOENT. This plugin redirects the import to the `/bundled` entrypoint (wasm inlined).
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
