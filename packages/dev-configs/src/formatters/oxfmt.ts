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
