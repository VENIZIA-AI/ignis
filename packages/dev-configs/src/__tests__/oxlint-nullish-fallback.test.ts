import { describe, expect, test } from 'bun:test';
import {
  BrowserOxlintConfigs,
  OxlintConfigs,
  oxlintConfigs,
  ReactOxlintConfigs,
} from '../linters/oxlint-presets';
import { eslintConfigs } from '../linters/eslint';
import { PreferNullishCoalescingRule } from '../linters/rules';

const rule = (config: { rules?: Record<string, unknown> }) =>
  config.rules?.[PreferNullishCoalescingRule.NAME];

/**
 * `value?.trim() || fallback` is an intentional empty-string fallback: `??` keeps `''` and changes
 * behaviour. The base preset allows `||` on a string and keeps reporting it on every other type.
 */
describe('prefer-nullish-coalescing in the oxlint presets', () => {
  test('oxlintConfigs allows || on a string and nothing else', () => {
    expect(rule(oxlintConfigs)).toEqual(['error', { ignorePrimitives: { string: true } }]);
  });

  test('the base preset is the same entry as the rule builder with the string option', () => {
    expect(rule(oxlintConfigs)).toEqual(
      PreferNullishCoalescingRule.build({ ignorePrimitives: { string: true } }),
    );
  });

  test('OxlintConfigs.create() without options is the base preset', () => {
    expect(rule(OxlintConfigs.create())).toEqual(rule(oxlintConfigs));
  });

  test('lenientFallback adds number on top of string', () => {
    expect(rule(OxlintConfigs.create({ lenientFallback: true }))).toEqual([
      'error',
      { ignorePrimitives: { string: true, number: true } },
    ]);
  });

  test('the base never ignores number, boolean or bigint', () => {
    const entry = rule(oxlintConfigs) as [string, { ignorePrimitives: Record<string, boolean> }];

    expect(Object.keys(entry[1].ignorePrimitives)).toEqual(['string']);
  });

  test('the browser and React presets inherit the string option', () => {
    expect(rule(BrowserOxlintConfigs.create())).toEqual(rule(oxlintConfigs));
    expect(rule(ReactOxlintConfigs.create())).toEqual(rule(oxlintConfigs));
  });
});

describe('prefer-nullish-coalescing in the ESLint preset', () => {
  const eslintEntry = () => {
    for (const config of eslintConfigs) {
      const entry = config.rules?.['@typescript-eslint/prefer-nullish-coalescing'];

      if (entry !== undefined) {
        return entry;
      }
    }

    return undefined;
  };

  test('allows `||` on a string, the same exception as the oxlint base', () => {
    expect(eslintEntry()).toEqual([
      'error',
      {
        allowRuleToRunWithoutStrictNullChecksIKnowWhatIAmDoing: true,
        ignorePrimitives: { string: true },
      },
    ]);
  });

  test('never ignores number, boolean or bigint', () => {
    const entry = eslintEntry() as [string, { ignorePrimitives: Record<string, boolean> }];

    expect(Object.keys(entry[1].ignorePrimitives)).toEqual(['string']);
  });
});
