import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { houseEslintPlugin, PreferFrameworkApiRule } from '../linters/house';
import { oxlintConfigs } from '../linters/oxlint';

const roots: Array<string> = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const temp = () => {
  const root = mkdtempSync(join(tmpdir(), 'ardor-notes-'));
  roots.push(root);

  return root;
};

const OXLINT = join(__dirname, '../../node_modules/.bin/oxlint');

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
    writeFileSync(
      join(root, 'documented.ts'),
      `export interface IReader {\n  /** Reads text. */\n  read(key: string): void;\n  /** Reads a number. */\n  read(key: number): void;\n}\n`,
    );
    writeFileSync(
      join(root, 'twins.ts'),
      `export interface IWriter {\n  write(key: string): void;\n  write(key: number): void;\n}\n`,
    );

    const run = Bun.spawnSync(
      [OXLINT, '-c', '.oxlintrc.json', '--no-ignore', 'documented.ts', 'twins.ts'],
      { cwd: root },
    );
    const report = run.stdout.toString();

    expect(report).toContain('twins.ts');
    expect(report).not.toContain('documented.ts');
  });
});

describe('@venizia/prefer-framework-api in the package that owns the hooks', () => {
  const CODE = `export const useSubject = () => window.matchMedia('print');\n`;

  const lintIn = (opts: { name: string }) => {
    const root = temp();
    mkdirSync(join(root, 'src/hooks'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: opts.name }));
    const config: Array<Linter.Config> = [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser as Linter.Parser },
        plugins: { '@venizia': houseEslintPlugin },
        rules: { [PreferFrameworkApiRule.NAME]: 'error' },
      },
    ];

    return new Linter({ cwd: root }).verify(CODE, config, {
      filename: join(root, 'src/hooks/use-subject.ts'),
    });
  };

  test('it is silent in @venizia/ardor-react and reports in any other package', () => {
    expect(lintIn({ name: '@venizia/ardor-react' })).toHaveLength(0);
    expect(lintIn({ name: 'an-app' })).toHaveLength(1);
  });
});
