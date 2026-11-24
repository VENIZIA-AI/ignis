import type { Linter } from 'eslint';
import { HOUSE_PLUGIN_NAMESPACE } from './common';
import { houseEslintPlugin } from './plugin';
import { RequireUseWhenRule } from './require-use-when.rule';

const SOURCE_FILES = ['**/*.{ts,tsx,mts,cts}'];
const TEST_FILES = ['**/__tests__/**', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'];

/**
 * The lint configs of a package other projects install: its public exports say when to use them (`@useWhen`). Not part of
 * `houseConfigs`: an app extending the house rules has no public surface to document.
 *
 * ```js
 * // .configs/lints/eslint.config.mjs
 * import { houseConfigs, PublishedPackageConfigs } from '@venizia/dev-configs/linters';
 *
 * export default [...houseConfigs, ...PublishedPackageConfigs.build({ baseline: '.configs/use-when-baseline.json' })];
 * ```
 */
export class PublishedPackageConfigs {
  /** `require-use-when` (error) and `pending-use-when` (warning) over source files, tests exempt. */
  static build(
    opts: {
      baseline?: string;
      entries?: ReadonlyArray<string>;
      types?: ReadonlyArray<string>;
    } = {},
  ): Linter.Config[] {
    return [
      {
        files: SOURCE_FILES,
        ignores: TEST_FILES,
        plugins: { [HOUSE_PLUGIN_NAMESPACE]: houseEslintPlugin },
        rules: {
          [RequireUseWhenRule.NAME]: RequireUseWhenRule.build(opts),
          [RequireUseWhenRule.PENDING_NAME]: RequireUseWhenRule.build({
            ...opts,
            severity: 'warn',
          }),
        },
      },
    ];
  }
}

/** `PublishedPackageConfigs.build()` with no baseline: every gap is an error. */
export const publishedPackageConfigs: Linter.Config[] = PublishedPackageConfigs.build();
