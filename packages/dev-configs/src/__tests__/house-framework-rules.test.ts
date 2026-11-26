import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import ts from 'typescript';
import tseslint from 'typescript-eslint';
import {
  houseConfigs,
  houseEslintPlugin,
  NoParentImportRule,
  PreferPromiseSleepRule,
  PreferTNullableRule,
  reactHouseConfigs,
} from '../linters/house';

/** One house rule on its own, so a finding or a fix is that rule's and no other's. */
const configFor = (opts: { name: string; options?: Linter.RuleEntry }): Linter.Config[] => [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser as Linter.Parser },
    plugins: { '@venizia': houseEslintPlugin },
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

describe('@venizia/prefer-tnullable', () => {
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

  test('an import under an alias is reused: no second specifier, the alias is written', () => {
    const { fixed } = run({
      name: NAME,
      code: `import type { TNullable as Maybe } from '@venizia/ignis-helpers/common';\nexport let x: string | null | undefined;\n`,
    });

    expect(fixed).toContain(`export let x: Maybe<string>;`);
    expect(fixed.match(/TNullable/g)).toHaveLength(1);
  });

  test('the message names the configured source', () => {
    const { findings } = run({
      name: NAME,
      options: ['error', { source: '#src/types' }],
      code: `let a: string | null | undefined;`,
    });

    expect(findings[0]?.message).toContain(`import type { TNullable } from '#src/types';`);
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

describe('@venizia/prefer-promise-sleep', () => {
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

  test('the message writes the import line, from the configured source', () => {
    const code = `export const p = new Promise((r) => setTimeout(r, 5));`;
    const messageOf = (opts: { source?: string }) =>
      run({ name: NAME, options: ['error', opts], code }).findings[0]?.message;

    expect(messageOf({})).toContain(
      `import { PromiseUtility } from '@venizia/ignis-helpers/core';`,
    );
    expect(messageOf({ source: '#src/utilities' })).toContain(
      `import { PromiseUtility } from '#src/utilities';`,
    );
  });

  test('an aliased PromiseUtility import is reused', () => {
    const { fixed } = run({
      name: NAME,
      code: `import { PromiseUtility as Timing } from '@venizia/ignis-helpers/core';\nexport const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));\n`,
    });

    expect(fixed).toContain(`Timing.sleep({ ms })`);
    expect(fixed.match(/PromiseUtility/g)).toHaveLength(1);
  });

  test('a type-only import is not used as a value: a value import is added beside it', () => {
    const { fixed } = run({
      name: NAME,
      code: `import type { PromiseUtility as P } from '@venizia/ignis-helpers/core';\nexport const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));\n`,
    });

    expect(fixed).toContain(`PromiseUtility.sleep({ ms })`);
    expect(fixed).toContain(`import { PromiseUtility } from '@venizia/ignis-helpers/core';`);

    const clash = run({
      name: NAME,
      code: `import type { PromiseUtility } from '@venizia/ignis-helpers/core';\nexport const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));\n`,
    });

    expect(clash.findings).toHaveLength(1);
    expect(clash.fixed).toContain('new Promise');
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

describe('@venizia/no-parent-import', () => {
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
    const { filename, cwd } = buildPackage({ imports: { '#src/*': './src/*.js' } });
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

  /** A package on disk whose files exist, so that every fixed import can be resolved the way a compiler and Bun resolve it. */
  const resolvable = (opts: { imports: Record<string, string> }) => {
    const { cwd, filename } = buildPackage({ imports: opts.imports });

    const put = (path: string, content = 'export const value = 1;\n') => {
      mkdirSync(join(cwd, 'src', path, '..'), { recursive: true });
      writeFileSync(join(cwd, 'src', path), content);
    };

    put('x.ts');
    put('folder/index.ts');
    put('data.json', '{"a":1}\n');
    writeFileSync(join(cwd, 'src', 'a', 'b', 'file.ts'), 'export {};\n');
    writeFileSync(
      join(cwd, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true },
      }),
    );
    put('x.tsx', 'export const view = 1;\n');

    /** Whether TypeScript (bundler resolution) and Bun both find `specifier` from the linted file. */
    const resolves = (specifier: string): boolean => {
      const options: ts.CompilerOptions = {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        resolveJsonModule: true,
      };
      const found = ts.resolveModuleName(specifier, filename, options, ts.sys).resolvedModule;

      let bun = true;

      try {
        Bun.resolveSync(specifier, join(cwd, 'src', 'a', 'b'));
        // eslint-disable-next-line @venizia/no-silent-catch -- the failure is the answer being asked for
      } catch {
        bun = false;
      }

      return found !== undefined && bun;
    };

    const fix = (code: string) => run({ name: NAME, options: ['warn'], filename, cwd, code });

    return { fix, resolves };
  };

  test.each([
    ['an extensionless file', `import { a } from '../../x';\n`, `'#src/x'`],
    ['a written .js extension is dropped', `import { a } from '../../x.js';\n`, `'#src/x'`],
    ['a written .ts extension is dropped', `import { a } from '../../x.ts';\n`, `'#src/x'`],
    ['a written .tsx extension is dropped', `import { a } from '../../x.tsx';\n`, `'#src/x'`],
    ['a folder gets /index', `import { a } from '../../folder';\n`, `'#src/folder/index'`],
    [
      'a written folder index.js is dropped to index',
      `import { a } from '../../folder/index.js';\n`,
      `'#src/folder/index'`,
    ],
  ])('with the preset map, %s resolves in TypeScript and Bun', (_name, code, expected) => {
    const { fix, resolves } = resolvable({ imports: { '#src/*': './src/*.js' } });
    const { fixed } = fix(code);

    expect(fixed).toContain(expected);
    expect(resolves(expected.slice(1, -1))).toBe(true);
  });

  test('a .json import is fixed only where the map has a #src/*.json key', () => {
    const keyed = resolvable({
      imports: { '#src/*.json': './src/*.json', '#src/*': './src/*.js' },
    });
    const unkeyed = resolvable({ imports: { '#src/*': './src/*.js' } });
    const code = `import data from '../../data.json';\n`;

    expect(keyed.fix(code).fixed).toContain(`'#src/data.json'`);
    expect(keyed.resolves('#src/data.json')).toBe(true);
    expect(unkeyed.fix(code).fixed).toBe(code);
  });

  test('with a bare ./src/* map the extension stays, and an extensionless import is reported and left alone', () => {
    const bare = resolvable({ imports: { '#src/*': './src/*' } });
    const withExtension = bare.fix(`import { a } from '../../x.ts';\n`).fixed;
    const extensionless = `import { a } from '../../x';\n`;
    const folder = `import { a } from '../../folder';\n`;

    expect(withExtension).toContain(`'#src/x.ts'`);
    expect(bare.fix(extensionless).fixed).toBe(extensionless);
    expect(bare.fix(folder).fixed).toBe(folder);
  });

  test("the preset's './src/*.js' target is a map too", () => {
    const { filename, cwd } = buildPackage({ imports: { '#src/*': './src/*.js' } });
    const { fixed } = run({
      name: NAME,
      options: ['warn'],
      filename,
      cwd,
      code: `import { a } from '../x';\n`,
    });

    expect(fixed).toBe(`import { a } from '#src/a/x';\n`);
  });

  test('a folder target gets /index unless the tsconfig paths resolve folders; a file target never does', () => {
    const plain = buildPackage({ imports: { '#src/*': './src/*.js' } });
    const withPaths = buildPackage({ imports: { '#src/*': './src/*.js' } });

    const src = (root: string, path: string, content = 'export {};\n') => {
      mkdirSync(join(root, 'src', path, '..'), { recursive: true });
      writeFileSync(join(root, 'src', path), content);
    };

    for (const { cwd } of [plain, withPaths]) {
      src(cwd, 'folder/index.ts');
      src(cwd, 'leaf.ts');
    }

    writeFileSync(
      join(withPaths.cwd, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '#src/*': ['./src/*', './src/*/index'] } } }),
    );

    const code = `import { a } from '../../folder';\nimport { b } from '../../leaf';\n`;
    const folderOnly = (opts: { cwd: string; filename: string }) =>
      run({ name: NAME, options: ['warn'], ...opts, code }).fixed;

    expect(folderOnly(plain)).toBe(
      `import { a } from '#src/folder/index';\nimport { b } from '#src/leaf';\n`,
    );
    expect(folderOnly(withPaths)).toBe(
      `import { a } from '#src/folder';\nimport { b } from '#src/leaf';\n`,
    );
  });

  test('without the map, or when the import leaves the mapped folder, it is reported and left alone', () => {
    const unmapped = buildPackage({});
    const mapped = buildPackage({ imports: { '#src/*': './src/*.js' } });
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
    const mapped = buildPackage({ imports: { '#src/*': './src/*.js' } });
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

  test('off in both presets; one config line turns it on', () => {
    const code = `import { a } from '../x';`;
    const findings = (configs: Linter.Config[], filename = 'src/b/a.ts') =>
      new Linter()
        .verify(code, configs, { filename })
        .filter((message) => message.ruleId === NAME || message.fatal);
    const optIn: Linter.Config = {
      files: ['**/*.{ts,tsx,mts,cts}'],
      rules: { '@venizia/no-parent-import': 'warn' },
    };

    expect(findings(houseConfigs)).toHaveLength(0);
    expect(findings(reactHouseConfigs, 'src/b/a.tsx')).toHaveLength(0);
    expect(findings([...houseConfigs, optIn]).map((message) => message.severity)).toEqual([1]);
  });
});
