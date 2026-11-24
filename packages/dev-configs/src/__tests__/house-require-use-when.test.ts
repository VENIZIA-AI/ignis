import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  houseConfigs,
  PublishedPackageConfigs,
  publishedPackageConfigs,
  RequireUseWhenRule,
} from '../linters/house';

const roots: Array<string> = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const write = (opts: { root: string; path: string; content: string }) => {
  const file = join(opts.root, opts.path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, opts.content);
};

/** A package on disk: `exports` pointing at `dist/esm/*.d.ts`, sources under `src`, a tsconfig, and the given files. */
const buildPackage = (opts: {
  files: Record<string, string>;
  exports?: Record<string, unknown>;
}) => {
  const root = mkdtempSync(join(tmpdir(), 'use-when-'));
  roots.push(root);
  write({
    root,
    path: 'package.json',
    content: JSON.stringify({
      name: 'sample',
      exports: opts.exports ?? { '.': { types: './dist/esm/index.d.ts' } },
    }),
  });
  write({
    root,
    path: 'tsconfig.json',
    content: JSON.stringify({
      compilerOptions: {
        module: 'esnext',
        moduleResolution: 'bundler',
        target: 'esnext',
        strict: true,
      },
      include: ['src'],
    }),
  });

  for (const [path, content] of Object.entries(opts.files)) {
    write({ root, path, content });
  }

  return root;
};

const lint = (opts: {
  root: string;
  file: string;
  configs?: Linter.Config[];
  filename?: string;
}) => {
  const { root, file, configs = publishedPackageConfigs } = opts;
  const filename = join(root, file);
  const code = readFileSync(filename, 'utf8');
  const config: Linter.Config[] = [
    { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser as Linter.Parser } },
    ...configs,
  ];

  return new Linter({ cwd: root }).verify(code, config, { filename });
};

const names = (messages: Array<{ message: string }>) =>
  messages.map((message) => /`([^`]+)`/.exec(message.message)?.[1]);

const SOURCE = `/** Waits.\n * @useWhen you need to wait */\nexport class Waiter {}\nexport class Bare {}\n/**\n * @useWhen\n */\nexport function empty() {}\nexport const value = 1;\nexport enum Mode { A }\nexport namespace Space { export const x = 1; }\nexport interface IShape {}\nexport type TLoose = string;\n/** @useWhen you write a nullable */\nexport type TNullable<T> = T | null | undefined;\nexport type ValueOrPromise<T> = T | Promise<T>;\n`;

describe('venizia/require-use-when', () => {
  test('every exported value and the framework types need a @useWhen; other types and tagged exports do not', () => {
    const root = buildPackage({ files: { 'src/index.ts': SOURCE } });
    const findings = lint({ root, file: 'src/index.ts' }).filter(
      (message) => message.ruleId === RequireUseWhenRule.NAME,
    );

    expect(names(findings).sort()).toEqual(
      ['Bare', 'Mode', 'Space', 'ValueOrPromise', 'empty', 'value'].sort(),
    );
    expect(findings.every((finding) => finding.severity === 2)).toBe(true);
  });

  test('the finding sits on the declaring file, through a barrel; a file that is not a declaration site has none', () => {
    const root = buildPackage({
      files: {
        'src/index.ts': `export * from './a';\nexport { b } from './b';\n`,
        'src/a.ts': `export class A {}\n`,
        'src/b.ts': `/** @useWhen b */\nexport const b = 1;\nexport const hidden = 2;\n`,
        'src/internal.ts': `export class Internal {}\n`,
      },
    });
    const run = (file: string) =>
      lint({ root, file }).filter((message) => message.ruleId === RequireUseWhenRule.NAME);

    expect(names(run('src/a.ts'))).toEqual(['A']);
    expect(run('src/b.ts')).toHaveLength(0);
    expect(run('src/index.ts')).toHaveLength(0);
    expect(run('src/internal.ts')).toHaveLength(0);
  });

  test('an export * as X statement carries its tag on the statement', () => {
    const root = buildPackage({
      files: {
        'src/index.ts': `/**\n * Everything.\n * @useWhen you want the whole set under one name\n */\nexport * as Tagged from './inner';\nexport * as Untagged from './inner';\n`,
        'src/inner.ts': `export const inner = 1;\n`,
      },
    });
    const findings = lint({ root, file: 'src/index.ts' }).filter(
      (message) => message.ruleId === RequireUseWhenRule.NAME,
    );

    expect(names(findings)).toEqual(['Untagged']);
  });

  test('an empty @insteadOf is reported', () => {
    const root = buildPackage({
      files: {
        'src/index.ts': `/**\n * @useWhen you need it\n * @insteadOf\n */\nexport const a = 1;\n/**\n * @useWhen you need it\n * @insteadOf new Promise(r => setTimeout(r, n))\n */\nexport const b = 2;\n`,
      },
    });
    const findings = lint({ root, file: 'src/index.ts' });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('`@insteadOf` on `a` is empty');
  });

  test('the entries come from package.json exports, or from the entries option', () => {
    const files = {
      'src/index.ts': `export class Main {}\n`,
      'src/extra.ts': `export class Extra {}\n`,
    };
    const derived = buildPackage({
      files,
      exports: {
        '.': { types: './dist/esm/index.d.ts' },
        './extra': { types: './dist/esm/extra.d.ts' },
      },
    });
    const named = buildPackage({ files, exports: { '.': { types: './dist/esm/index.d.ts' } } });

    expect(names(lint({ root: derived, file: 'src/extra.ts' }))).toEqual(['Extra']);
    expect(lint({ root: named, file: 'src/extra.ts' })).toHaveLength(0);
    expect(
      names(
        lint({
          root: named,
          file: 'src/extra.ts',
          configs: PublishedPackageConfigs.build({ entries: ['src/index.ts', 'src/extra.ts'] }),
        }),
      ),
    ).toEqual(['Extra']);
  });
});

describe('the baseline', () => {
  const files = {
    'src/index.ts': `export class Pending {}\nexport class Fresh {}\n/** @useWhen done */\nexport class Swept {}\n`,
  };

  test('a baselined gap is a warning, a gap outside it an error, and a swept entry still listed is an error', () => {
    const root = buildPackage({ files });
    write({
      root,
      path: '.configs/use-when-baseline.json',
      content: JSON.stringify({ entries: ['src/index.ts#Pending', 'src/index.ts#Swept'] }),
    });
    const findings = lint({
      root,
      file: 'src/index.ts',
      configs: PublishedPackageConfigs.build({ baseline: '.configs/use-when-baseline.json' }),
    });
    const bySeverity = (severity: number) =>
      names(findings.filter((finding) => finding.severity === severity));

    expect(bySeverity(1)).toEqual(['Pending']);
    expect(bySeverity(2).sort()).toEqual(['Fresh', 'Swept']);
    expect(
      findings.find((finding) => finding.message.includes('remove it from the baseline'))?.ruleId,
    ).toBe(RequireUseWhenRule.NAME);
  });

  test('a missing or unreadable baseline exempts nothing, and the rule is not part of houseConfigs', () => {
    const root = buildPackage({ files });
    write({ root, path: 'bad.json', content: '{ nope' });

    for (const baseline of ['missing.json', 'bad.json']) {
      const findings = lint({
        root,
        file: 'src/index.ts',
        configs: PublishedPackageConfigs.build({ baseline }),
      });

      expect(names(findings).sort()).toEqual(['Fresh', 'Pending']);
    }

    const house = lint({ root, file: 'src/index.ts', configs: houseConfigs });

    expect(house.filter((message) => message.ruleId?.endsWith('use-when'))).toHaveLength(0);
  });

  test('test files are exempt', () => {
    const root = buildPackage({
      files: {
        'src/index.ts': `export class A {}\n`,
        'src/__tests__/a.test.ts': `export class T {}\n`,
      },
    });

    expect(lint({ root, file: 'src/__tests__/a.test.ts' })).toHaveLength(0);
  });
});
