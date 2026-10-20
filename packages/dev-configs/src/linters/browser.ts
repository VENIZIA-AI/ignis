import type { OxlintConfig } from 'oxlint';
import { LintIgnore } from './ignore';
import { type IOxlintPresetOptions, OxlintConfigs } from './oxlint';
import { NoRestrictedPropertiesRule } from './rules';

/**
 * `oxlintConfigs` for code that runs in a browser, React or not: the base rules plus the
 * secure-context ban (`crypto.randomUUID` is `undefined` on a plain-http origin). Nothing in the base
 * is relaxed. `ReactOxlintConfigs` builds on this preset. Takes the same options as `OxlintConfigs`.
 *
 * ```ts
 * // .configs/lints/oxlint.config.mts
 * import { defineConfig } from 'oxlint';
 * import { BrowserOxlintConfigs } from '@venizia/dev-configs/linters/oxlint';
 *
 * export default defineConfig(BrowserOxlintConfigs.create());
 * ```
 */
export class BrowserOxlintConfigs {
  static create(opts: IOxlintPresetOptions = {}): OxlintConfig {
    const baseConfigs = OxlintConfigs.create({ lenientFallback: opts.lenientFallback });

    return LintIgnore.oxlint({
      config: {
        ...baseConfigs,
        rules: {
          ...baseConfigs.rules,
          [NoRestrictedPropertiesRule.NAME]: NoRestrictedPropertiesRule.build(),
        },
      },
      patterns: opts.ignore ?? [],
    });
  }
}
