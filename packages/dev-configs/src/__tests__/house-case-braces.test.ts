import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import { eslintConfigs, oxlintConfigs } from '../linters';
import { NoUnbracedCaseRule } from '../linters/house';
import { SwitchCaseBracesRule } from '../linters/rules';

const UNBRACED = `switch (kind) {\n  case 'a':\n    run();\n    break;\n  default:\n    stop();\n}\n`;
const BRACED = `switch (kind) {\n  case 'a': {\n    run();\n    break;\n  }\n  default: {\n    stop();\n  }\n}\n`;
const STACKED = `switch (kind) {\n  case 'a':\n  case 'b': {\n    run();\n    break;\n  }\n}\n`;

/** The `venizia/no-unbraced-case` findings of `code` under the ESLint-only preset. */
const findings = (code: string) =>
  new Linter()
    .verify(code, eslintConfigs, { filename: 'subject.js' })
    .filter((message) => message.ruleId === NoUnbracedCaseRule.NAME);

describe('venizia/no-unbraced-case', () => {
  test('eslintConfigs reports each case and default that has statements without a block', () => {
    expect(findings(UNBRACED)).toHaveLength(2);
  });

  test('a braced case, stacked labels and an empty case are not reported', () => {
    expect(findings(BRACED)).toHaveLength(0);
    expect(findings(STACKED)).toHaveLength(0);
  });

  test('the fix wraps the statements in a block', () => {
    const { output } = new Linter().verifyAndFix(UNBRACED, eslintConfigs, {
      filename: 'subject.js',
    });

    expect(output).toContain(`case 'a':\n    { run();\n    break; }`);
    expect(output).toContain(`default:\n    { stop(); }`);
  });
});

/** Every preset keeps the braces rule: `curly` for control-flow bodies and the switch-case check. */
describe('the braces rule stays in every preset', () => {
  test('eslintConfigs pins curly: all and venizia/no-unbraced-case', () => {
    const rules = Object.assign({}, ...eslintConfigs.map((config) => config.rules ?? {}));

    expect(rules.curly).toEqual(['error', 'all']);
    expect(rules[NoUnbracedCaseRule.NAME]).toEqual(NoUnbracedCaseRule.build());
  });

  test('oxlintConfigs pins curly: all and unicorn/switch-case-braces: always', () => {
    const curly = oxlintConfigs.overrides?.map((override) => override.rules?.curly).find(Boolean);

    expect(curly).toEqual(['error', 'all']);
    expect(oxlintConfigs.rules?.[SwitchCaseBracesRule.NAME]).toEqual(SwitchCaseBracesRule.build());
  });
});
