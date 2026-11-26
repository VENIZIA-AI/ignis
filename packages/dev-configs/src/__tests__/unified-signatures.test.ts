import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { eslintConfigs } from '../linters/eslint';
import { oxlintConfigs } from '../linters/oxlint';

const roots: Array<string> = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const temp = () => {
  const root = mkdtempSync(join(tmpdir(), 'unified-signatures-'));
  roots.push(root);

  return root;
};

const OXLINT = join(__dirname, '../../node_modules/.bin/oxlint');
const RULE = '@typescript-eslint/unified-signatures';
const DOCUMENTED = `export interface IReader {\n  /** Reads text. */\n  read(key: string): void;\n  /** Reads a number. */\n  read(key: number): void;\n}\n`;
const TWINS = `export interface IWriter {\n  write(key: string): void;\n  write(key: number): void;\n}\n`;

describe('unified-signatures', () => {
  test('overloads with TSDoc of their own pass, undocumented twins are reported', () => {
    const root = temp();
    writeFileSync(
      join(root, '.oxlintrc.json'),
      JSON.stringify({
        plugins: ['typescript'],
        categories: { correctness: 'off' },
        rules: {
          'typescript/unified-signatures': oxlintConfigs.rules?.['typescript/unified-signatures'],
        },
      }),
    );
    writeFileSync(join(root, 'documented.ts'), DOCUMENTED);
    writeFileSync(join(root, 'twins.ts'), TWINS);

    const run = Bun.spawnSync(
      [OXLINT, '-c', '.oxlintrc.json', '--no-ignore', 'documented.ts', 'twins.ts'],
      { cwd: root },
    );
    const report = run.stdout.toString();

    expect(report).toContain('twins.ts');
    expect(report).not.toContain('documented.ts');
  });

  test('the ESLint preset carries the same option', () => {
    const entry = eslintConfigs.map((config) => config.rules?.[RULE]).find(Boolean);
    const report = (code: string) =>
      new Linter().verify(
        code,
        [
          {
            files: ['**/*.ts'],
            languageOptions: { parser: tseslint.parser as Linter.Parser },
            plugins: { '@typescript-eslint': tseslint.plugin },
            rules: { [RULE]: entry },
          },
        ],
        { filename: 'subject.ts' },
      ).length;

    expect(report(DOCUMENTED)).toBe(0);
    expect(report(TWINS)).toBe(1);
  });
});
