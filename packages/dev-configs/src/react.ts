import type { ESLint, Linter } from "eslint";
import { eslintConfigs } from "./eslint";

/** Without `configs`: each plugin types its presets its own way, and only the rules are used here. */
type TRulesPlugin = Omit<ESLint.Plugin, "configs">;

export interface IReactEslintPlugins {
  react: TRulesPlugin;
  reactHooks: TRulesPlugin;
  jsxA11y: TRulesPlugin;
}

const NAMING_CONVENTION = "@typescript-eslint/naming-convention";

/**
 * The base preset plus what a React frontend needs on top: the React, hooks and accessibility rules,
 * and the base rules a UI relaxes on purpose. The plugins come in as options, so a backend that
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
  static create(opts: {
    plugins: IReactEslintPlugins;
    reactVersion?: string;
  }): Linter.Config[] {
    const { react, reactHooks, jsxA11y } = opts.plugins;
    const { reactVersion = "detect" } = opts;

    // The last config that sets it wins, as in ESLint itself.
    const baseNaming = [...eslintConfigs]
      .reverse()
      .find((config) => config.rules?.[NAMING_CONVENTION])?.rules?.[
      NAMING_CONVENTION
    ];
    // A bare severity carries no selectors; nothing to extend then but the severity.
    const [severity, ...selectors]: Linter.RuleSeverityAndOptions =
      Array.isArray(baseNaming) ? baseNaming : [baseNaming ?? "error"];

    return [
      ...eslintConfigs,
      {
        files: ["**/*.{jsx,tsx}"],
        plugins: { react, "jsx-a11y": jsxA11y },
        settings: { react: { version: reactVersion } },
        rules: {
          // The base naming rule, plus PascalCase functions: a component declared as `function App()`.
          [NAMING_CONVENTION]: [
            severity,
            ...selectors,
            { selector: "function", format: ["camelCase", "PascalCase"] },
          ],

          // Correctness rules from react's recommended set. Left out: what the automatic JSX runtime or
          // tsc already covers (react-in-jsx-scope, jsx-uses-react, prop-types, jsx-no-undef,
          // jsx-no-duplicate-props, no-unknown-property).
          "react/display-name": "error",
          "react/jsx-boolean-value": "error",
          "react/jsx-key": "error",
          "react/jsx-no-comment-textnodes": "error",
          "react/jsx-no-target-blank": "error",
          "react/no-children-prop": "error",
          "react/no-danger-with-children": "error",
          "react/no-deprecated": "error",
          "react/no-direct-mutation-state": "error",
          "react/no-find-dom-node": "error",
          "react/no-is-mounted": "error",
          "react/no-render-return-value": "error",
          "react/no-string-refs": "error",
          "react/require-render-return": "error",

          "jsx-a11y/alt-text": "error",
          "jsx-a11y/anchor-has-content": "error",
          "jsx-a11y/aria-props": "error",
          "jsx-a11y/aria-proptypes": "error",
          "jsx-a11y/aria-role": "error",
          "jsx-a11y/aria-unsupported-elements": "error",
          "jsx-a11y/role-has-required-aria-props": "error",
          "jsx-a11y/role-supports-aria-props": "error",
          "jsx-a11y/tabindex-no-positive": "error",
        },
      },
      {
        // Custom hooks live in .ts files too.
        files: ["**/*.{js,jsx,ts,tsx}"],
        plugins: { "react-hooks": reactHooks },
        rules: {
          "react-hooks/rules-of-hooks": "error",
          "react-hooks/exhaustive-deps": "warn",
        },
      },
      {
        rules: {
          "@typescript-eslint/consistent-type-imports": [
            "error",
            { prefer: "type-imports" },
          ],
          // A UI hands promises to event handlers and effects that do not await them.
          "@typescript-eslint/no-floating-promises": "off",
          "no-void": "off",

          // Function components, not classes; a component may be used above its declaration.
          "@typescript-eslint/no-invalid-this": "off",
          "@typescript-eslint/no-use-before-define": "off",

          "@typescript-eslint/no-explicit-any": "warn",
          "@typescript-eslint/no-shadow": "warn",
          "@typescript-eslint/no-unused-vars": [
            "warn",
            {
              argsIgnorePattern: "^_",
              varsIgnorePattern: "^_",
              caughtErrorsIgnorePattern: "^_",
              ignoreRestSiblings: true,
            },
          ],
        },
      },
    ];
  }
}
