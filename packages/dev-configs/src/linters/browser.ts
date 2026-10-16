import type { OxlintConfig } from 'oxlint';
import { oxlintConfigs } from './oxlint';
import { NoRestrictedPropertiesRule } from './rules';

/**
 * `oxlintConfigs` for code that runs in a browser, React or not: the base rules plus the
 * secure-context ban (`crypto.randomUUID` is `undefined` on a plain-http origin). Nothing in the base
 * is relaxed. `ReactOxlintConfigs` builds on this preset.
 *
 * ```ts
 * // .configs/oxlint.config.mts
 * import { defineConfig } from 'oxlint';
 * import { BrowserOxlintConfigs } from '@venizia/dev-configs/linters';
 *
 * export default defineConfig(BrowserOxlintConfigs.create());
 * ```
 */
export class BrowserOxlintConfigs {
  static create(): OxlintConfig {
    return {
      ...oxlintConfigs,
      rules: {
        ...oxlintConfigs.rules,
        [NoRestrictedPropertiesRule.NAME]: NoRestrictedPropertiesRule.build(),
      },
    };
  }
}
