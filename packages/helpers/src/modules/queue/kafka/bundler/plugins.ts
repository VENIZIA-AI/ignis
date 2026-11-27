import { getError } from '@/modules/error';
import type { BunPlugin } from 'bun';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import {
  KafkaBundlerPluginNames,
  PlatformaticRequireSpecifiers,
  PlatformaticWasmSpecifiers,
} from './common';

/** Every `@platformatic/kafka` fix needed by `bun build --compile`: a service compile script registers `build()` instead of tracking the individual plugins. */
export class PlatformaticKafkaPlugins {
  /** `@platformatic/kafka` resolves some dependencies through `createRequire(import.meta.url)` at module scope (2.8-2.9, and 2.20); `bun build --compile` cannot see through that, so the binary dies with "Cannot find package" before boot - this plugin hoists those calls to static imports of the file each `require` would load. A version with no such call is left as it is. */
  static buildRequirePlugin(): BunPlugin {
    return {
      name: KafkaBundlerPluginNames.PLATFORMATIC_REQUIRE,
      setup(build) {
        build.onLoad({ filter: PlatformaticRequireSpecifiers.MODULE_FILTER }, async (args) => {
          const source = await Bun.file(args.path).text();
          // The file the `require` would load: an `import` of the bare specifier follows other `exports` conditions, and
          // a package that exports a sub-path to `require` only (`mnemonist/lru-cache.js`) does not resolve.
          const { resolve } = createRequire(args.path);
          const imports: string[] = [];

          const contents = source.replace(
            PlatformaticRequireSpecifiers.REQUIRE_PATTERN,
            (matched, binding: string, _quote: string, specifier: string) => {
              if (PlatformaticRequireSpecifiers.SKIPPED_SPECIFIERS.includes(specifier)) {
                return matched;
              }

              const alias = `${PlatformaticRequireSpecifiers.IMPORT_ALIAS_PREFIX}${imports.length}`;
              imports.push(`import ${alias} from ${JSON.stringify(resolve(specifier))};`);

              // No `?.default` unwrap: a default import already yields `module.exports` for CJS, and
              // unwrapping would break JSON payloads carrying their own top-level `default` key - the
              // draft-06 meta schema has one, so unwrapping silently replaces it with `{}`.
              return `const ${binding} = ${alias};`;
            },
          );

          // No match is not an error: upstream fixing this makes the plugin an inert no-op.
          if (!imports.length) {
            return undefined;
          }

          return { contents: `${imports.join('\n')}\n${contents}`, loader: 'js' };
        });
      },
    };
  }

  /** `@platformatic/wasm-utils`'s default entrypoint reads `native.wasm` from disk at module load and `bun build --compile` embeds JS only, so it resolves against `/$bunfs` and the binary dies with ENOENT - this plugin redirects the import to the `/bundled` entrypoint (wasm inlined). */
  static buildWasmPlugin(): BunPlugin {
    return {
      name: KafkaBundlerPluginNames.PLATFORMATIC_WASM,
      setup(build) {
        build.onResolve({ filter: PlatformaticWasmSpecifiers.ENTRYPOINT_FILTER }, (args) => {
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
    };
  }

  static build(): BunPlugin[] {
    return [
      PlatformaticKafkaPlugins.buildWasmPlugin(),
      PlatformaticKafkaPlugins.buildRequirePlugin(),
    ];
  }
}
