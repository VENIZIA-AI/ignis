import type { ESLint, Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { eslintConfigs, namingConventionConfigs } from './eslint';
import { JSX_FILES } from './jsx-files';
import { NamingConventionRule, NoRestrictedPropertiesRule } from './rules';

/** Without `configs`: each plugin types its presets its own way, and only the rules are used here. */
type TRulesPlugin = Omit<ESLint.Plugin, 'configs'>;

export interface IReactEslintPlugins {
  react: TRulesPlugin;
  reactHooks: TRulesPlugin;
  jsxA11y: TRulesPlugin;
}

/**
 * The base preset plus what a React frontend needs on top: the React, hooks and accessibility rules.
 * Frontend code is held to the backend's standard - no floating promise, no `void`, no use before
 * declaration - so nothing in the base is relaxed. The plugins come in as options, so a backend that
 * never calls this installs none of them.
 *
 * ```js
 * import react from 'eslint-plugin-react';
 * import reactHooks from 'eslint-plugin-react-hooks';
 * import jsxA11y from 'eslint-plugin-jsx-a11y';
 *
 * export default ReactEslintConfigs.create({ plugins: { react, reactHooks, jsxA11y } });
 * ```
 *
 * `reactVersion` defaults to `detect`. Under ESLint 10, eslint-plugin-react 7 cannot detect it and
 * aborts, so pass the version there (`reactVersion: '19.2'`).
 */
export class ReactEslintConfigs {
  static create(opts: { plugins: IReactEslintPlugins; reactVersion?: string }): Linter.Config[] {
    const { react, reactHooks, jsxA11y } = opts.plugins;
    const { reactVersion = 'detect' } = opts;

    return [
      ...eslintConfigs,
      {
        files: JSX_FILES,
        plugins: { react, 'jsx-a11y': jsxA11y },
        settings: { react: { version: reactVersion } },
        rules: {
          // The base naming rule, plus PascalCase functions: a component declared as `function App()`.
          [NamingConventionRule.NAME]: NamingConventionRule.build({
            extraSelectors: [{ selector: 'function', format: ['camelCase', 'PascalCase'] }],
          }),

          // Correctness rules from react's recommended set. Left out: what the automatic JSX runtime or
          // tsc already covers (react-in-jsx-scope, jsx-uses-react, prop-types, jsx-no-undef,
          // jsx-no-duplicate-props, no-unknown-property).
          'react/display-name': 'error',
          'react/jsx-boolean-value': 'error',
          'react/jsx-key': 'error',
          'react/jsx-no-comment-textnodes': 'error',
          'react/jsx-no-target-blank': 'error',
          'react/no-children-prop': 'error',
          'react/no-danger-with-children': 'error',
          'react/no-deprecated': 'error',
          'react/no-direct-mutation-state': 'error',
          'react/no-find-dom-node': 'error',
          'react/no-is-mounted': 'error',
          'react/no-render-return-value': 'error',
          'react/no-string-refs': 'error',
          'react/require-render-return': 'error',

          'jsx-a11y/alt-text': 'error',
          'jsx-a11y/anchor-has-content': 'error',
          'jsx-a11y/aria-props': 'error',
          'jsx-a11y/aria-proptypes': 'error',
          'jsx-a11y/aria-role': 'error',
          'jsx-a11y/aria-unsupported-elements': 'error',
          'jsx-a11y/role-has-required-aria-props': 'error',
          'jsx-a11y/role-supports-aria-props': 'error',
          'jsx-a11y/tabindex-no-positive': 'error',
          'jsx-a11y/anchor-is-valid': 'error',
          'jsx-a11y/click-events-have-key-events': 'error',
          'jsx-a11y/heading-has-content': 'error',
          'jsx-a11y/label-has-associated-control': 'error',
          'jsx-a11y/no-noninteractive-element-interactions': 'error',
          'jsx-a11y/no-static-element-interactions': 'error',
        },
      },
      {
        // Custom hooks live in .ts files too.
        files: ['**/*.{js,jsx,ts,tsx}'],
        plugins: { 'react-hooks': reactHooks },
        rules: {
          'react-hooks/rules-of-hooks': 'error',
          'react-hooks/exhaustive-deps': 'error',
        },
      },
      {
        rules: {
          '@typescript-eslint/consistent-type-imports': [
            'error',
            {
              prefer: 'type-imports',
              fixStyle: 'inline-type-imports',
              disallowTypeAnnotations: false,
            },
          ],
          [NoRestrictedPropertiesRule.NAME]: NoRestrictedPropertiesRule.build() as Linter.RuleEntry,
        },
      },
    ];
  }
}

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
