import { describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { ConstClassValuesRule, houseConfigs, houseEslintPlugin } from '../linters/house';

const CONST_CLASS_RULE = 'venizia/const-class-values';
const CAST_RULE = '@typescript-eslint/consistent-type-assertions';

/** Runs the house configs on `code` as if it lived in `filename`, and returns the findings of `ruleId`. */
const findings = (opts: { code: string; ruleId: string; filename?: string }) => {
  const { code, ruleId, filename = 'src/subject.ts' } = opts;
  const messages = new Linter().verify(code, houseConfigs, { filename });
  return messages.filter((message) => message.ruleId === ruleId);
};

describe('venizia/const-class-values', () => {
  const flagged = (code: string) => findings({ code, ruleId: CONST_CLASS_RULE });

  test('warns on an exported type alias that is a union of string literals', () => {
    const [finding] = flagged(`export type TMode = 'read' | 'write';`);

    expect(finding?.severity).toBe(1);
  });

  test('warns on a union inside an exported interface, function and class', () => {
    expect(flagged(`export interface IOptions { storage?: 'memory' | 'disk' }`)).toHaveLength(1);
    expect(flagged(`export const run = (opts: { shape: 'list' | 'one' }) => opts;`)).toHaveLength(
      1,
    );
    expect(
      flagged(
        `export class Reader { read(opts: { format: 'array' | 'record' }) { return opts; } }`,
      ),
    ).toHaveLength(1);
    expect(flagged(`export type TAlgorithm<T extends 'a' | 'b' = 'a'> = T;`)).toHaveLength(1);
  });

  test('ignores a null or undefined member next to the literals', () => {
    expect(flagged(`export type TMode = 'read' | 'write' | null;`)).toHaveLength(1);
    expect(flagged(`export type TMode = 'read' | null;`)).toHaveLength(0);
  });

  test('ignores a declaration that is not exported', () => {
    expect(
      flagged(`type TMode = 'read' | 'write'; export const mode: TMode = 'read';`),
    ).toHaveLength(0);
  });

  test('ignores a union that is not made of string literals', () => {
    expect(flagged(`export type TId = 'auto' | number;`)).toHaveLength(0);
    expect(flagged(`export type TId = string | number;`)).toHaveLength(0);
  });

  test('ignores key sets: Pick, Omit, Extract, Exclude, Record and mapped types', () => {
    const code = [
      `export type TA = Pick<{ a: 1; b: 2; c: 3 }, 'a' | 'b'>;`,
      `export type TB = Omit<{ a: 1; b: 2; c: 3 }, 'a' | 'b'>;`,
      `export type TC = Extract<'a' | 'b' | 'c', 'a' | 'b'>;`,
      `export type TD = Record<'a' | 'b', number>;`,
      `export type TE = { [K in 'a' | 'b']: number };`,
    ].join('\n');

    expect(flagged(code)).toHaveLength(0);
  });

  test('is off in test files', () => {
    const code = `export type TMode = 'read' | 'write';`;

    expect(
      findings({ code, ruleId: CONST_CLASS_RULE, filename: 'src/__tests__/a.test.ts' }),
    ).toHaveLength(0);
  });

  test('namePattern narrows the rule to matching exported type aliases', () => {
    const config: Linter.Config[] = [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser as Linter.Parser },
        plugins: { venizia: houseEslintPlugin },
        rules: {
          [ConstClassValuesRule.NAME]: ConstClassValuesRule.build({
            severity: 'warn',
            namePattern: '(State|Status)$',
          }),
        },
      },
    ];
    const code = `export type TJobStatus = 'a' | 'b'; export type TShape = 'c' | 'd';`;
    const messages = new Linter().verify(code, config, { filename: 'src/subject.ts' });

    expect(messages.map((message) => message.line)).toEqual([1]);
    expect(messages).toHaveLength(1);
  });
});

describe('@typescript-eslint/consistent-type-assertions', () => {
  const flagged = (opts: { code: string; filename?: string }) =>
    findings({ ...opts, ruleId: CAST_RULE });

  test('warns on `as X`, `as any` and `as unknown as X`', () => {
    expect(flagged({ code: `const a = value as string;` })).toHaveLength(1);
    expect(flagged({ code: `const a = value as any;` })).toHaveLength(1);
    expect(flagged({ code: `const a = value as unknown as string;` })[0]?.severity).toBe(1);
  });

  test('allows `as const` and `satisfies`', () => {
    expect(flagged({ code: `const a = ['x', 'y'] as const;` })).toHaveLength(0);
    expect(flagged({ code: `const a = { x: 1 } satisfies Record<string, number>;` })).toHaveLength(
      0,
    );
  });

  test('is off in test files', () => {
    const code = `const a = value as string;`;

    expect(flagged({ code, filename: 'src/__tests__/a.test.ts' })).toHaveLength(0);
    expect(flagged({ code, filename: 'src/a.spec.ts' })).toHaveLength(0);
  });
});
