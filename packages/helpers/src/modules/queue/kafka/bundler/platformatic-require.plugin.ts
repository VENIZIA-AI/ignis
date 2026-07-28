import type { BunPlugin } from 'bun';
import { KafkaBundlerPluginNames, PlatformaticRequireSpecifiers } from './common';

/** `@platformatic/kafka` resolves some dependencies through `createRequire(import.meta.url)` at module scope; `bun build --compile` cannot see through that, so the specifier stays unresolved and the binary dies with "Cannot find package" before boot - this plugin hoists those calls to static imports at bundle time. */
export const platformaticRequirePlugin = (): BunPlugin => ({
  name: KafkaBundlerPluginNames.PLATFORMATIC_REQUIRE,
  setup(build) {
    build.onLoad({ filter: PlatformaticRequireSpecifiers.MODULE_FILTER }, async args => {
      const source = await Bun.file(args.path).text();
      const imports: string[] = [];

      const contents = source.replace(
        PlatformaticRequireSpecifiers.REQUIRE_PATTERN,
        (matched, binding: string, _quote: string, specifier: string) => {
          if (PlatformaticRequireSpecifiers.SKIPPED_SPECIFIERS.includes(specifier)) {
            return matched;
          }

          const alias = `${PlatformaticRequireSpecifiers.IMPORT_ALIAS_PREFIX}${imports.length}`;
          imports.push(`import ${alias} from ${JSON.stringify(specifier)};`);

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
});
