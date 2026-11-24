import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  houseConfigs,
  houseEslintPlugin,
  NoParentImportRule,
  PreferPromiseSleepRule,
  PreferTNullableRule,
} from '../linters/house';

/** One house rule on its own, so a finding or a fix is that rule's and no other's. */
const configFor = (opts: { name: string; options?: Linter.RuleEntry }): Linter.Config[] => [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser as Linter.Parser },
    plugins: { venizia: houseEslintPlugin },
    rules: { [opts.name]: opts.options ?? ['error'] },
  },
];

const run = (opts: {
  name: string;
  code: string;
  options?: Linter.RuleEntry;
  filename?: string;
  cwd?: string;
}) => {
  const { name, code, options, filename = 'src/subject.ts', cwd } = opts;
  const config = configFor({ name, options });
  const linter = new Linter({ cwd });

  return {
    findings: linter.verify(code, config, { filename }),
    fixed: linter.verifyAndFix(code, config, { filename }).output,
  };
};

describe('venizia/prefer-tnullable', () => {
  const NAME = PreferTNullableRule.NAME;

  test('X | null | undefined, in any order, becomes TNullable<X> and the import is added', () => {
    for (const union of [
      'string | null | undefined',
      'undefined | string | null',
      'null | undefined | string',
    ]) {
      const { findings, fixed } = run({ name: NAME, code: `export type TName = ${union};\n` });

      expect(findings).toHaveLength(1);
      expect(fixed).toBe(
        `import type { TNullable } from '@venizia/ignis-helpers/common';\nexport type TName = TNullable<string>;\n`,
      );
    }
  });

  test('the other members stay inside the generic, and the import goes after the last import', () => {
    const { fixed } = run({
      name: NAME,
      code: `import { a } from './a';\nimport { b } from './b';\nlet x: Array<string | number | null | undefined>;\n`,
    });

    expect(fixed).toBe(
      `import { a } from './a';\nimport { b } from './b';\nimport type { TNullable } from '@venizia/ignis-helpers/common';\nlet x: Array<TNullable<string | number>>;\n`,
    );
  });

  test('a file that already imports or declares TNullable gets no second import', () => {
    const imported = run({
      name: NAME,
      code: `import type { TNullable } from '../types';\nlet x: string | null | undefined;\n`,
    });
    const declared = run({
      name: NAME,
      code: `type TNullable<T> = T | null | undefined;\nlet x: string | null | undefined;\n`,
    });

    expect(imported.fixed).toContain(`let x: TNullable<string>;`);
    expect(imported.fixed.match(/import/g)).toHaveLength(1);
    expect(declared.fixed).toContain(`let x: TNullable<string>;`);
    expect(declared.fixed).not.toContain('import');
  });

  test('only null, only undefined, and the definition of TNullable itself are left alone', () => {
    expect(run({ name: NAME, code: `let a: string | null;` }).findings).toHaveLength(0);
    expect(run({ name: NAME, code: `let a: string | undefined;` }).findings).toHaveLength(0);
    expect(
      run({ name: NAME, code: `export type TNullable<T> = T | undefined | null;` }).findings,
    ).toHaveLength(0);
  });

  test('source: null reports without a fix, and source names another module', () => {
    const noFix = run({
      name: NAME,
      options: ['error', { source: null }],
      code: `let a: string | null | undefined;`,
    });
    const other = run({
      name: NAME,
      options: ['error', { source: '#src/types' }],
      code: `let a: string | null | undefined;\n`,
    });

    expect(noFix.findings).toHaveLength(1);
    expect(noFix.fixed).toBe(`let a: string | null | undefined;`);
    expect(other.fixed).toContain(`import type { TNullable } from '#src/types';`);
  });
});

describe('venizia/prefer-promise-sleep', () => {
  const NAME = PreferPromiseSleepRule.NAME;
  const IMPORT = `import { PromiseUtility } from '@venizia/ignis-helpers/core';`;

  test.each([
    [
      'an arrow with an expression body',
      `await new Promise((resolve) => setTimeout(resolve, 50));`,
    ],
    ['a block body', `await new Promise((r) => { setTimeout(r, 50); });`],
    ['a function expression', `await new Promise(function (r) { setTimeout(r, 50); });`],
  ])('%s is a sleep: reported and fixed', (_name, statement) => {
    const { findings, fixed } = run({
      name: NAME,
      code: `async function f() {\n  ${statement}\n}\n`,
    });

    expect(findings).toHaveLength(1);
    expect(fixed).toBe(
      `${IMPORT}\nasync function f() {\n  await PromiseUtility.sleep({ ms: 50 });\n}\n`,
    );
  });

  test('the delay expression is kept as written', () => {
    const { fixed } = run({
      name: NAME,
      code: `const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms * 2));\n`,
    });

    expect(fixed).toContain(`PromiseUtility.sleep({ ms: ms * 2 })`);
  });

  test('a callback that does more, or a timer that resolves with a value, is not a sleep', () => {
    expect(
      run({ name: NAME, code: `new Promise((resolve) => { log(); setTimeout(resolve, 1); });` })
        .findings,
    ).toHaveLength(0);
    expect(
      run({ name: NAME, code: `new Promise((resolve) => setTimeout(() => resolve(1), 1));` })
        .findings,
    ).toHaveLength(0);
    expect(
      run({ name: NAME, code: `new Promise((resolve, reject) => setTimeout(resolve, 1));` })
        .findings,
    ).toHaveLength(0);
    expect(
      run({ name: NAME, code: `new Promise((resolve) => setTimeout(other, 1));` }).findings,
    ).toHaveLength(0);
  });

  test('houseConfigs turns it on for source and off for tests', () => {
    const code = `new Promise((resolve) => setTimeout(resolve, 1));`;
    const source = new Linter().verify(code, houseConfigs, { filename: 'src/a.ts' });
    const testFile = new Linter().verify(code, houseConfigs, {
      filename: 'src/__tests__/a.test.ts',
    });

    expect(source.filter((message) => message.ruleId === NAME)).toHaveLength(1);
    expect(testFile.filter((message) => message.ruleId === NAME)).toHaveLength(0);
  });
});

describe('venizia/no-parent-import', () => {
  const NAME = NoParentImportRule.NAME;
  const roots: Array<string> = [];

  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /** A package on disk with (or without) the `#src/*` map, and the absolute path of a file in `src/a/b`. */
  const buildPackage = (opts: { imports?: Record<string, string> }) => {
    const root = mkdtempSync(join(tmpdir(), 'no-parent-import-'));
    roots.push(root);
    mkdirSync(join(root, 'src', 'a', 'b'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'p', imports: opts.imports }));

    return { cwd: root, filename: join(root, 'src', 'a', 'b', 'file.ts') };
  };

  test('a parent import is reported as a warning, a same-folder one is not', () => {
    const { findings } = run({
      name: NAME,
      options: ['warn'],
      code: `import { a } from '../x';\nimport { b } from './y';\nexport * from '../../z';\nexport { c } from '../w';\n`,
    });

    expect(findings).toHaveLength(3);
    expect(findings.every((finding) => finding.severity === 1)).toBe(true);
  });

  test('with a #src map the import is rewritten from the map, for import and export forms', () => {
    const { filename, cwd } = buildPackage({ imports: { '#src/*': './src/*' } });
    const { fixed } = run({
      name: NAME,
      options: ['warn'],
      filename,
      cwd,
      code: `import { a } from '../x';\nimport type { T } from '../../t/u';\nexport * from '../../z';\n`,
    });

    expect(fixed).toBe(
      `import { a } from '#src/a/x';\nimport type { T } from '#src/t/u';\nexport * from '#src/z';\n`,
    );
  });

  test('without the map, or when the import leaves the mapped folder, it is reported and left alone', () => {
    const unmapped = buildPackage({});
    const mapped = buildPackage({ imports: { '#src/*': './src/*' } });
    const code = `import { a } from '../x';\n`;
    const leaving = `import { a } from '../../../../x';\n`;

    expect(run({ name: NAME, options: ['warn'], ...unmapped, code }).findings).toHaveLength(1);
    expect(run({ name: NAME, options: ['warn'], ...unmapped, code }).fixed).toBe(code);
    expect(run({ name: NAME, options: ['warn'], ...mapped, code: leaving }).findings).toHaveLength(
      1,
    );
    expect(run({ name: NAME, options: ['warn'], ...mapped, code: leaving }).fixed).toBe(leaving);
  });

  test('houseConfigs warns in source and stays quiet in tests', () => {
    const code = `import { a } from '../x';`;
    const source = new Linter().verify(code, houseConfigs, { filename: 'src/b/a.ts' });
    const testFile = new Linter().verify(code, houseConfigs, {
      filename: 'src/b/__tests__/a.test.ts',
    });

    expect(source.find((message) => message.ruleId === NAME)?.severity).toBe(1);
    expect(testFile.filter((message) => message.ruleId === NAME)).toHaveLength(0);
  });
});
