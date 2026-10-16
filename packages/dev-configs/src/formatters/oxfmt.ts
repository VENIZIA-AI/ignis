import type { OxfmtConfig } from 'oxfmt';

/**
 * The oxfmt port of `prettierConfigs` - the same seven options, so the output matches Prettier's.
 *
 * ```ts
 * // .configs/oxfmt.config.mts
 * import { defineConfig } from 'oxfmt';
 * import { oxfmtConfigs } from '@venizia/dev-configs/formatters';
 *
 * export default defineConfig(oxfmtConfigs);
 * ```
 */
export const oxfmtConfigs: OxfmtConfig = {
  bracketSpacing: true,
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  trailingComma: 'all',
  arrowParens: 'avoid',
  semi: true,
};

/**
 * `oxfmtConfigs` for browser and React code: arrow parameters always in parentheses (`(x) => x`),
 * and the closing `>` of a multi-line JSX element on its last attribute line, which keeps JSX diffs
 * small. `bracketSameLine` changes nothing outside JSX.
 *
 * ```ts
 * // .configs/oxfmt.config.mts
 * import { defineConfig } from 'oxfmt';
 * import { browserOxfmtConfigs } from '@venizia/dev-configs/formatters';
 *
 * export default defineConfig(browserOxfmtConfigs);
 * ```
 */
export const browserOxfmtConfigs: OxfmtConfig = {
  ...oxfmtConfigs,
  arrowParens: 'always',
  bracketSameLine: true,
};
