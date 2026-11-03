import type { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { namingConventionConfigs } from './eslint';
import { JSX_FILES } from './jsx-files';
import { NamingConventionRule } from './rules';

/** A component is declared as `function App()`, so functions may be PascalCase too. */
const COMPONENT_FUNCTION_SELECTOR = { selector: 'function', format: ['camelCase', 'PascalCase'] };

/**
 * `namingConventionConfigs` for a React project: the base rule plus PascalCase functions in .jsx and
 * .tsx files, where a component is declared as `function App()`.
 */
export const reactNamingConventionConfigs: Linter.Config[] = [
  ...namingConventionConfigs,
  {
    files: JSX_FILES,
    languageOptions: { parser: tseslint.parser as Linter.Parser },
    plugins: { '@typescript-eslint': tseslint.plugin as never },
    rules: {
      [NamingConventionRule.NAME]: NamingConventionRule.build({
        extraSelectors: [COMPONENT_FUNCTION_SELECTOR],
      }),
    },
  },
];
