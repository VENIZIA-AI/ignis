import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  FrameworkRuleApis,
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

  test('a file that already imports TNullable gets no second import', () => {
    const { fixed } = run({
      name: NAME,
      code: `import type { TNullable } from '../types';\nlet x: string | null | undefined;\n`,
    });

    expect(fixed).toContain(`let x: TNullable<string>;`);
    expect(fixed.match(/import/g)).toHaveLength(1);
  });

  test('a TNullable or interface the file declares itself is reported and never written toward', () => {
    for (const local of [
      `type TNullable<T> = T | null | undefined;`,
      `interface TNullable<T> { value: T }`,
    ]) {
      const code = `${local}\nlet x: string | null | undefined;\n`;
      const { findings, fixed } = run({ name: NAME, code });

      expect(findings.some((finding) => finding.line === 2)).toBe(true);
      expect(fixed).toBe(code);
    }
  });

  test('a function, constructor or conditional member keeps its parentheses', () => {
    const cases: Array<[string, string]> = [
      [
        `let x: string | (() => void) | null | undefined;`,
        `let x: TNullable<string | (() => void)>;`,
      ],
      [`let x: (new () => B) | null | undefined;`, `let x: TNullable<(new () => B)>;`],
      [
        `let x: A | (T extends U ? X : Y) | null | undefined;`,
        `let x: TNullable<A | (T extends U ? X : Y)>;`,
      ],
      [`let x: null | A | undefined | B;`, `let x: TNullable<A | B>;`],
    ];

    for (const [code, expected] of cases) {
      const { fixed } = run({ name: NAME, code: `export {};\n${code}\n` });

      expect(fixed).toContain(expected);
      expect(() =>
        new Linter().verify(fixed, configFor({ name: NAME }), { filename: 'src/a.ts' }),
      ).not.toThrow();
      expect(
        new Linter()
          .verify(fixed, configFor({ name: NAME }), { filename: 'src/a.ts' })
          .some((finding) => finding.fatal),
      ).toBe(false);
    }
  });

  test('the import goes after a shebang and the directives, never before them', () => {
    const useClient = run({
      name: NAME,
      code: `'use client';\n\nexport let x: string | null | undefined;\n`,
    });
    const shebang = run({
      name: NAME,
      code: `#!/usr/bin/env bun\nexport let x: string | null | undefined;\n`,
    });

    expect(useClient.fixed.startsWith(`'use client';\n`)).toBe(true);
    expect(useClient.fixed).toContain(
      `import type { TNullable } from '@venizia/ignis-helpers/common';`,
    );
    expect(shebang.fixed.startsWith(`#!/usr/bin/env bun\n`)).toBe(true);
    expect(shebang.fixed).toContain(`import type { TNullable }`);
  });

  test('a script (no import or export) and a declaration file are reported and left alone', () => {
    const script = run({ name: NAME, code: `let x: string | null | undefined;\n` });
    const ambient = run({
      name: NAME,
      filename: 'src/globals.d.ts',
      code: `declare let x: string | null | undefined;\nexport {};\n`,
    });

    expect(script.findings).toHaveLength(1);
    expect(script.fixed).toBe(`let x: string | null | undefined;\n`);
    expect(ambient.findings).toHaveLength(1);
    expect(ambient.fixed).toBe(`declare let x: string | null | undefined;\nexport {};\n`);
  });

  test('a union with a comment is reported and left alone, so the comment is not lost', () => {
    const code = `export let x: string | /* kept */ null | undefined;\n`;
    const { findings, fixed } = run({ name: NAME, code });

    expect(findings).toHaveLength(1);
    expect(fixed).toBe(code);
  });

  test('the name joins an import the file already has from that module', () => {
    const typeList = run({
      name: NAME,
      code: `import type { TOther } from '@venizia/ignis-helpers/common';\nexport let x: string | null | undefined;\n`,
    });
    const valueList = run({
      name: NAME,
      code: `import { other } from '@venizia/ignis-helpers/common';\nexport let x: string | null | undefined;\n`,
    });
    const namespace = run({
      name: NAME,
      code: `import * as helpers from '@venizia/ignis-helpers/common';\nexport let x: string | null | undefined;\n`,
    });

    expect(typeList.fixed).toContain(
      `import type { TOther, TNullable } from '@venizia/ignis-helpers/common';`,
    );
    expect(typeList.fixed.match(/import/g)).toHaveLength(1);
    expect(valueList.fixed).toContain(
      `import { other, type TNullable } from '@venizia/ignis-helpers/common';`,
    );
    expect(namespace.fixed.match(/import/g)).toHaveLength(2);
  });

  test('an inserted import after a directive or a shebang is followed by a blank line', () => {
    const useClient = run({
      name: NAME,
      code: `'use client';\n\nexport let x: string | null | undefined;\n`,
    });
    const shebang = run({
      name: NAME,
      code: `#!/usr/bin/env bun\nexport let x: string | null | undefined;\n`,
    });
    const plain = run({ name: NAME, code: `export let x: string | null | undefined;\n` });

    expect(useClient.fixed).toContain(`@venizia/ignis-helpers/common';\n\nexport let x`);
    expect(shebang.fixed).toContain(`@venizia/ignis-helpers/common';\n\nexport let x`);
    expect(plain.fixed).toContain(`@venizia/ignis-helpers/common';\nexport let x`);
  });

  test('the message names the configured source', () => {
    const { findings } = run({
      name: NAME,
      options: ['error', { source: '#src/types' }],
      code: `let a: string | null | undefined;`,
    });

    expect(findings[0]?.message).toContain('#src/types');
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
      code: `export let a: string | null | undefined;\n`,
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
      code: `export async function f() {\n  ${statement}\n}\n`,
    });

    expect(findings).toHaveLength(1);
    expect(fixed).toBe(
      `${IMPORT}\nexport async function f() {\n  await PromiseUtility.sleep({ ms: 50 });\n}\n`,
    );
  });

  test('a delay variable named ms is written as the shorthand, and the value joins an existing import', () => {
    const { fixed } = run({
      name: NAME,
      code: `import { getError } from '@venizia/ignis-helpers/core';\nexport const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));\n`,
    });

    expect(fixed).toContain(`PromiseUtility.sleep({ ms })`);
    expect(fixed).toContain(
      `import { getError, PromiseUtility } from '@venizia/ignis-helpers/core';`,
    );
    expect(fixed.match(/import/g)).toHaveLength(1);
  });

  test('the delay expression is kept as written', () => {
    const { fixed } = run({
      name: NAME,
      code: `export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms * 2));\n`,
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

  test('a setTimeout the file binds itself, and a comma-expression delay, are not a sleep', () => {
    expect(
      run({
        name: NAME,
        code: `export const f = (setTimeout: (r: () => void, n: number) => void) => new Promise((r) => setTimeout(r, 5));`,
      }).findings,
    ).toHaveLength(0);
    expect(
      run({
        name: NAME,
        code: `import { setTimeout } from 'node:timers';\nexport const p = new Promise((r) => setTimeout(r, 5));`,
      }).findings,
    ).toHaveLength(0);
    expect(
      run({ name: NAME, code: `export const p = new Promise((r) => setTimeout(r, (a(), 5)));` })
        .findings,
    ).toHaveLength(0);
    expect(
      run({ name: NAME, code: `export const p = new Promise((r) => setTimeout(r, 5));` }).findings,
    ).toHaveLength(1);
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

  test('a dynamic import is reported without a fix, and a package.json that does not parse never stops the run', () => {
    const mapped = buildPackage({ imports: { '#src/*': './src/*' } });
    const dynamic = run({
      name: NAME,
      options: ['warn'],
      ...mapped,
      code: `export const load = () => import('../x');\n`,
    });

    expect(dynamic.findings).toHaveLength(1);
    expect(dynamic.fixed).toBe(`export const load = () => import('../x');\n`);

    const broken = buildPackage({});
    writeFileSync(join(broken.cwd, 'package.json'), '{ not json');
    const code = `import { a } from '../x';\n`;
    const result = run({ name: NAME, options: ['warn'], ...broken, code });

    expect(result.findings).toHaveLength(1);
    expect(result.fixed).toBe(code);
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

describe('FrameworkRuleApis', () => {
  /** House rules that point at no framework API: they enforce a style, not a replacement. */
  const NOT_FRAMEWORK = [
    'const-class-values',
    'effect-cleanup-consistency',
    'max-params-own',
    'no-async-hook-callback',
    'no-await-new-chain',
    'no-await-promise-chain',
    'no-inline-await',
    'no-leaked-render',
    'no-new-error',
    'no-return-await',
    'no-silent-catch',
    'no-unbraced-case',
  ];

  test('every rule of the plugin has an entry, or is listed as a style rule: a new rule cannot skip the table', () => {
    const names = Object.keys(houseEslintPlugin.rules ?? {});
    const missing = names.filter(
      (name) =>
        !NOT_FRAMEWORK.includes(name) &&
        FrameworkRuleApis.of({ rule: `venizia/${name}` }) === undefined,
    );

    expect(missing).toEqual([]);
  });

  test('an entry names an API, where it comes from and a replacement, and only plugin rules have one', () => {
    const names = Object.keys(houseEslintPlugin.rules ?? {});

    for (const [rule, entry] of Object.entries(FrameworkRuleApis.TABLE)) {
      expect(names).toContain(rule.replace('venizia/', ''));
      expect(entry.api.length).toBeGreaterThan(0);
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.replacement.length).toBeGreaterThan(0);
    }

    expect(FrameworkRuleApis.of({ rule: 'venizia/prefer-tnullable' })).toMatchObject({
      api: 'TNullable',
      source: '@venizia/ignis-helpers/common',
      package: '@venizia/ignis-helpers',
    });
    expect(FrameworkRuleApis.of({ rule: 'venizia/no-new-error' })).toBeUndefined();
  });
});
