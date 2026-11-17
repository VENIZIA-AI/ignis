import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import {
  eslintConfigs,
  houseConfigs,
  namingConventionConfigs,
  paddingConfigs,
  reactHouseConfigs,
} from '../linters';
import { LinesBetweenClassMembersRule, PaddingLineBetweenStatementsRule } from '../linters/rules';

/** The padding configs ride on the TypeScript parser of the naming configs, as they do inside `houseConfigs`. */
const CONFIGS = [...namingConventionConfigs, ...paddingConfigs];

/** Runs the padding configs on `code` with `--fix` semantics and returns the fixed source. */
const fixed = (code: string): string => {
  const result = new Linter().verifyAndFix(code, CONFIGS, { filename: 'src/subject.ts' });

  return result.output;
};

/** The findings the padding configs leave after the fix: a fix that does not settle is a rule fight. */
const leftover = (code: string): string[] => {
  const output = fixed(code);
  const messages = new Linter().verify(output, CONFIGS, { filename: 'src/subject.ts' });

  return messages.map((message) => `${message.ruleId}: ${message.message}`);
};

describe('a blank line after the import block', () => {
  test('is added between the last import and the first statement', () => {
    expect(fixed(`import a from 'a';\nimport b from 'b';\nconst x = a + b;\n`)).toBe(
      `import a from 'a';\nimport b from 'b';\n\nconst x = a + b;\n`,
    );
  });

  test('is not added between two imports', () => {
    const code = `import a from 'a';\nimport b from 'b';\n\nexport const x = a + b;\n`;

    expect(fixed(code)).toBe(code);
  });
});

describe('a blank line before a return that follows other statements', () => {
  test('is added after a statement', () => {
    expect(fixed(`function f() {\n  const x = 1;\n  return x;\n}\n`)).toBe(
      `function f() {\n  const x = 1;\n\n  return x;\n}\n`,
    );
  });

  test('is not added when the return is the only statement', () => {
    const code = `function f() {\n  return 1;\n}\n`;

    expect(fixed(code)).toBe(code);
  });
});

describe('a blank line between class members', () => {
  test('is added between methods', () => {
    expect(fixed(`class A {\n  a() {\n    return 1;\n  }\n  b() {\n    return 2;\n  }\n}\n`)).toBe(
      `class A {\n  a() {\n    return 1;\n  }\n\n  b() {\n    return 2;\n  }\n}\n`,
    );
  });

  test('may be left out after a one-line member', () => {
    const code = `class A {\n  x = 1;\n  y = 2;\n\n  a() {\n    return this.x;\n  }\n}\n`;

    expect(fixed(code)).toBe(code);
  });

  test('overload signatures stay together', () => {
    const code = `class A {\n  f(a: string): void;\n  f(a: number): void;\n  f(a: unknown): void {\n    void a;\n  }\n}\n`;

    expect(fixed(code)).toBe(code);
  });
});

describe('a blank line around a block-like statement', () => {
  test('is added after one that another statement follows', () => {
    expect(fixed(`function f(a: boolean) {\n  if (a) {\n    g();\n  }\n  h();\n}\n`)).toBe(
      `function f(a: boolean) {\n  if (a) {\n    g();\n  }\n\n  h();\n}\n`,
    );
  });

  test('is added before one that follows other statements', () => {
    expect(fixed(`function f(a: boolean) {\n  h();\n  if (a) {\n    g();\n  }\n}\n`)).toBe(
      `function f(a: boolean) {\n  h();\n\n  if (a) {\n    g();\n  }\n}\n`,
    );
  });

  test('covers for, while, do, switch, try and a bare block', () => {
    const before = [
      'function f(xs: number[]) {',
      '  a();',
      '  for (const x of xs) {',
      '    b(x);',
      '  }',
      '  while (c()) {',
      '    d();',
      '  }',
      '  do {',
      '    e();',
      '  } while (c());',
      '  switch (xs.length) {',
      '    case 0: {',
      '      break;',
      '    }',
      '  }',
      '  try {',
      '    g();',
      '  } catch {',
      '    h();',
      '  }',
      '  {',
      '    i();',
      '  }',
      '  j();',
      '}',
      '',
    ].join('\n');
    const output = fixed(before);

    expect(output.split('\n').filter((line) => line === '')).toHaveLength(8);
    expect(leftover(before)).toEqual([]);
  });

  test('stacked case labels stay together, and cases may be separated or not', () => {
    const code = [
      'function f(a: string) {',
      '  switch (a) {',
      "    case 'A':",
      "    case 'a': {",
      '      return 1;',
      '    }',
      "    case 'B':",
      "    case 'b': {",
      '      return 2;',
      '    }',
      '',
      '    default: {',
      '      return 3;',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n');

    expect(fixed(code)).toBe(code);
  });

  test('an else or catch chain is one statement and is not split', () => {
    const code = [
      'function f(a: boolean) {',
      '  if (a) {',
      '    g();',
      '  } else {',
      '    h();',
      '  }',
      '',
      '  try {',
      '    g();',
      '  } catch {',
      '    h();',
      '  } finally {',
      '    i();',
      '  }',
      '}',
      '',
    ].join('\n');

    expect(fixed(code)).toBe(code);
  });

  test('no blank line is needed at the start or the end of a block', () => {
    const code = `function f(a: boolean) {\n  if (a) {\n    g();\n  }\n}\n`;

    expect(fixed(code)).toBe(code);
  });

  test('a one-line statement before another one-line statement is untouched', () => {
    const code = `function f() {\n  a();\n  b();\n  c();\n}\n`;

    expect(fixed(code)).toBe(code);
  });

  test('a declaration whose value ends in a block counts as block-like', () => {
    expect(fixed(`const a = 1;\nconst f = () => {\n  return a;\n};\nconst b = 2;\n`)).toBe(
      `const a = 1;\n\nconst f = () => {\n  return a;\n};\n\nconst b = 2;\n`,
    );
  });
});

describe('the rules do not fight each other', () => {
  test('one pass settles a mixed file', () => {
    const code = [
      "import a from 'a';",
      'export class A {',
      '  x = 1;',
      '  m(b: boolean) {',
      '    const y = a;',
      '    if (b) {',
      '      return y;',
      '    }',
      '    return this.x;',
      '  }',
      '  n() {',
      '    return 1;',
      '  }',
      '}',
      '',
    ].join('\n');

    expect(leftover(code)).toEqual([]);
  });
});

describe('where the rules are wired', () => {
  const ruleNames = [PaddingLineBetweenStatementsRule.NAME, LinesBetweenClassMembersRule.NAME];

  for (const [name, configs] of [
    ['paddingConfigs', paddingConfigs],
    ['houseConfigs', houseConfigs],
    ['reactHouseConfigs', reactHouseConfigs],
    ['eslintConfigs', eslintConfigs],
  ] as const) {
    test(`${name} turns both rules on as errors`, () => {
      const rules = configs.flatMap((config) => Object.entries(config.rules ?? {}));

      for (const ruleName of ruleNames) {
        const entry = rules.find(([key]) => key === ruleName)?.[1];
        const severity = Array.isArray(entry) ? entry[0] : entry;

        expect(severity).toBe('error');
      }
    });
  }

  test('the rule names are the @stylistic ones', () => {
    expect(ruleNames).toEqual([
      '@stylistic/padding-line-between-statements',
      '@stylistic/lines-between-class-members',
    ]);
  });
});
