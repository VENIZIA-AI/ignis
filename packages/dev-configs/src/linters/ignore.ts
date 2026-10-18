import type { Linter } from 'eslint';
import type { OxlintConfig } from 'oxlint';

/**
 * Project paths a lint run skips: generated files, vendored code, bundles. The same list feeds both
 * tools, because each reads it differently.
 *
 * - oxlint: `ignorePatterns` resolve against the folder of the config file, so one in `.configs/` can
 *   never name a project path. `LintIgnore.oxlint` turns every rule off for the paths instead.
 * - ESLint: `LintIgnore.eslint` is a flat-config `ignores` entry, relative to where eslint runs.
 *
 * ```ts
 * const LINT_IGNORE = ['src/components/shadcn/**', 'dev-dist/**'];
 * defineConfig(ReactOxlintConfigs.create({ ignore: LINT_IGNORE })); // oxlint.config.mts
 * export default [LintIgnore.eslint({ patterns: LINT_IGNORE }), ...reactHouseConfigs]; // eslint.config.mjs
 * ```
 */
export class LintIgnore {
  /** A project path such as `src/gen/**`, as an override glob: it is matched from anywhere under the project. */
  static toGlob(opts: { pattern: string }): string {
    const pattern = opts.pattern.replace(/^\.?\//, '');
    return pattern.startsWith('**/') ? pattern : `**/${pattern}`;
  }

  static eslint(opts: { patterns: string[] }): Linter.Config {
    return { ignores: opts.patterns };
  }

  static oxlint(opts: { config: OxlintConfig; patterns: string[] }): OxlintConfig {
    const { config, patterns } = opts;
    if (patterns.length === 0) {
      return config;
    }

    const rules = new Set([
      ...Object.keys(config.rules ?? {}),
      ...(config.overrides ?? []).flatMap(override => Object.keys(override.rules ?? {})),
    ]);

    return {
      ...config,
      overrides: [
        ...(config.overrides ?? []),
        {
          files: patterns.map(pattern => LintIgnore.toGlob({ pattern })),
          rules: Object.fromEntries([...rules].map(name => [name, 'off'])),
        },
      ],
    };
  }
}
