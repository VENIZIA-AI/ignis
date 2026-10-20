import type { OxlintConfig } from 'oxlint';
import { BrowserOxlintConfigs } from './browser';
import { LintIgnore } from './ignore';
import { JSX_FILES } from './jsx-files';
import type { IOxlintPresetOptions } from './oxlint';

// This file imports no ESLint package, so a config that only needs the oxlint preset does not load them.
const SOURCE_FILES = ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

/**
 * The oxlint counterpart of `ReactEslintConfigs`: `BrowserOxlintConfigs` (the base rules plus the
 * secure-context ban) plus the React, hooks and accessibility rules and `consistent-type-imports`.
 * oxlint runs these plugins natively, so nothing is passed in. `react/no-deprecated` has no oxlint
 * port and is left out.
 *
 * Nothing in the base is relaxed - frontend code meets the backend's standard - and
 * `exhaustive-deps` is an error. Takes the same options as `OxlintConfigs`.
 *
 * ```ts
 * // .configs/oxlint.config.mts
 * import { defineConfig } from 'oxlint';
 * import { ReactOxlintConfigs } from '@venizia/dev-configs/linters/oxlint';
 *
 * export default defineConfig(ReactOxlintConfigs.create());
 * ```
 */
export class ReactOxlintConfigs {
  static create(opts: IOxlintPresetOptions = {}): OxlintConfig {
    const browserConfigs = BrowserOxlintConfigs.create({ lenientFallback: opts.lenientFallback });

    const config: OxlintConfig = {
      ...browserConfigs,
      plugins: [...new Set([...(browserConfigs.plugins ?? []), 'react', 'jsx-a11y'] as const)],
      overrides: [
        ...(browserConfigs.overrides ?? []),
        {
          files: JSX_FILES,
          rules: {
            // Correctness rules from react's recommended set, as in ReactEslintConfigs.
            'react/display-name': 'error',
            'react/jsx-boolean-value': 'error',
            'react/jsx-key': 'error',
            'react/jsx-no-comment-textnodes': 'error',
            'react/jsx-no-target-blank': 'error',
            'react/no-children-prop': 'error',
            'react/no-danger-with-children': 'error',
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
          files: SOURCE_FILES,
          rules: {
            'react/rules-of-hooks': 'error',
            'react/exhaustive-deps': 'error',
            'typescript/consistent-type-imports': [
              'error',
              {
                prefer: 'type-imports',
                fixStyle: 'inline-type-imports',
                disallowTypeAnnotations: false,
              },
            ],
          },
        },
      ],
    };

    return LintIgnore.oxlint({ config, patterns: opts.ignore ?? [] });
  }
}
