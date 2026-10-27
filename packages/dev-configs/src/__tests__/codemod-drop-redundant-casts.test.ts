import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import {
  CastKeepReasons,
  DropRedundantCastsCommand,
  RedundantCasts,
} from '../cli/codemod/drop-redundant-casts';

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    target: 'es2022',
    module: 'esnext',
    moduleResolution: 'bundler',
    lib: ['es2022'],
    types: [],
    noEmit: true,
    skipLibCheck: true,
  },
  include: ['src'],
});

describe('drop-redundant-casts', () => {
  let root: string;
  let logs: string[];
  let warnings: string[];

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'casts-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'src/__tests__'), { recursive: true });
    writeFileSync(join(root, 'tsconfig.json'), TSCONFIG);
    logs = [];
    warnings = [];
    spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    spyOn(console, 'warn').mockImplementation((...args) => {
      warnings.push(args.join(' '));
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const write = (path: string, content: string) => writeFileSync(join(root, path), content);
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const run = (paths: string[], includeTests = false) =>
    RedundantCasts.run({
      typescript: ts,
      tsconfigPath: join(root, 'tsconfig.json'),
      root,
      files: paths.map((path) => join(root, path)),
      includeTests,
    });
  const only = (paths: string[]) => run(paths).files[0];
  const reasons = (result: ReturnType<typeof only>) => result?.kept.map((entry) => entry.reason);

  test('a cast the compiler does not need is removed', () => {
    write('src/a.ts', "const name: string = 'x';\nexport const label = name as string;\n");

    const result = only(['src/a.ts']);

    expect(result?.removed).toBe(1);
    expect(result?.output).toBe("const name: string = 'x';\nexport const label = name;\n");
  });

  test('a cast whose removal breaks the typecheck stays, and is reported as needed', () => {
    write(
      'src/a.ts',
      [
        'const takes = (value: string) => value;',
        'export const result = (mixed: string | number) => takes(mixed as string);',
        '',
      ].join('\n'),
    );

    const result = only(['src/a.ts']);

    expect(result?.removed).toBe(0);
    expect(result?.output).toContain('takes(mixed as string)');
    expect(reasons(result)).toEqual([CastKeepReasons.NEEDED]);
  });

  test('the needed cast does not hide the redundant one next to it', () => {
    write(
      'src/a.ts',
      [
        'const takes = (value: string) => value;',
        "const plain: string = 'y';",
        'export const a = (mixed: string | number) => takes(mixed as string);',
        'export const b = plain as string;',
        '',
      ].join('\n'),
    );

    const result = only(['src/a.ts']);

    expect(result?.removed).toBe(1);
    expect(result?.output).toContain('takes(mixed as string)');
    expect(result?.output).toContain('export const b = plain;');
  });

  test('as const, as unknown, a double cast and a cast of any are never touched', () => {
    write(
      'src/a.ts',
      [
        "export const tuple = ['a', 'b'] as const;",
        'export const wide = 1 as unknown;',
        'export const double = 1 as unknown as string;',
        'declare const loose: any;',
        'export const fromAny = loose as string;',
        "export const fromJson = JSON.parse('1') as number;",
        '',
      ].join('\n'),
    );

    const result = only(['src/a.ts']);

    expect(result?.removed).toBe(0);
    expect(result?.changed).toBe(false);
    expect(reasons(result)).toEqual([
      CastKeepReasons.AS_CONST,
      CastKeepReasons.UNKNOWN_TARGET,
      CastKeepReasons.DOUBLE_CAST,
      CastKeepReasons.UNKNOWN_TARGET,
      CastKeepReasons.ANY_EXPRESSION,
      CastKeepReasons.ANY_EXPRESSION,
    ]);
  });

  test('a cast inside another cast is tried in a later round', () => {
    write(
      'src/a.ts',
      [
        'const box: { size: number } = { size: 1 };',
        'export const size = (box as { size: number }).size as number;',
        '',
      ].join('\n'),
    );

    const result = only(['src/a.ts']);

    expect(result?.removed).toBe(2);
    expect(result?.output).toContain('export const size = (box).size;');
  });

  test('an angle-bracket assertion is removed like as', () => {
    write('src/a.ts', "const name: string = 'x';\nexport const label = <string>name;\n");

    expect(only(['src/a.ts'])?.output).toContain('export const label = name;');
  });

  test('an import the removal leaves unused is dropped, an older unused import is not', () => {
    write(
      'src/types.ts',
      'export interface Foo { a: number }\nexport interface Old { b: number }\n',
    );
    write(
      'src/a.ts',
      [
        "import type { Foo } from './types';",
        "import type { Old } from './types';",
        'export const value = { a: 1 } as Foo;',
        '',
      ].join('\n'),
    );

    const result = only(['src/a.ts']);

    expect(result?.importsRemoved).toBe(1);
    expect(result?.output).not.toContain('Foo');
    expect(result?.output).toContain("import type { Old } from './types';");
  });

  test('an import that is still used is kept', () => {
    write('src/types.ts', 'export interface Foo { a: number }\n');
    write(
      'src/a.ts',
      [
        "import type { Foo } from './types';",
        'declare const foo: Foo;',
        'export const same = foo as Foo;',
        '',
      ].join('\n'),
    );

    const result = only(['src/a.ts']);

    expect(result?.removed).toBe(1);
    expect(result?.importsRemoved).toBe(0);
    expect(result?.output).toContain("import type { Foo } from './types';");
  });

  test('errors the package already had are ignored, and do not stop a removal', () => {
    write(
      'src/a.ts',
      [
        'export const broken: number = "not a number";',
        "const name: string = 'x';",
        'export const label = name as string;',
        '',
      ].join('\n'),
    );

    const project = run(['src/a.ts']);

    expect(project.baselineErrors).toBe(1);
    expect(project.files[0]?.removed).toBe(1);
  });

  test('a removal that makes a new error elsewhere is refused', () => {
    write('src/a.ts', "export const value = { name: 'x' } as { name: string | undefined };\n");
    write('src/b.ts', "import { value } from './a';\nvalue.name = undefined;\n");

    const project = run(['src/a.ts']);

    expect(project.files[0]?.removed).toBe(0);
    expect(project.files[0]?.output).toContain('as { name: string | undefined }');
  });

  test('a test file is skipped unless --include-tests is given', () => {
    write(
      'src/__tests__/a.test.ts',
      "const name: string = 'x';\nexport const label = name as string;\n",
    );

    const skipped = only(['src/__tests__/a.test.ts']);
    const included = run(['src/__tests__/a.test.ts'], true).files[0];

    expect(skipped?.removed).toBe(0);
    expect(reasons(skipped)).toEqual([CastKeepReasons.TEST_FILE]);
    expect(included?.removed).toBe(1);
  });

  test('many casts are checked a handful of times, not once each', () => {
    const lines = ["const text: string = 'x';"];
    for (let index = 0; index < 40; index += 1) {
      lines.push(`export const v${index} = text as string;`);
    }
    lines.push('const takes = (value: string) => value;');
    lines.push('export const needed = (mixed: string | number) => takes(mixed as string);');
    write('src/a.ts', `${lines.join('\n')}\n`);

    const project = run(['src/a.ts']);

    expect(project.files[0]?.removed).toBe(40);
    expect(project.files[0]?.output).toContain('takes(mixed as string)');
    expect(project.checks).toBeLessThan(20);
  });

  describe('the command', () => {
    const code = (args: string[]) =>
      DropRedundantCastsCommand.run({ root, args: ['drop-redundant-casts', ...args].slice(1) });

    const redundant = "const name: string = 'x';\nexport const label = name as string;\n";

    test('without --write it is a dry run: it lists the removal, writes nothing and exits 0', async () => {
      write('src/a.ts', redundant);

      expect(await code([])).toBe(0);
      expect(read('src/a.ts')).toBe(redundant);
      expect(logs.join('\n')).toContain('would remove  src/a.ts');
      expect(logs.join('\n')).toContain('Nothing was written');
    });

    test('--check exits 1 while a cast is removable, and 0 when none is', async () => {
      write('src/a.ts', redundant);
      expect(await code(['--check'])).toBe(1);
      expect(read('src/a.ts')).toBe(redundant);

      write('src/a.ts', "export const tuple = ['a'] as const;\n");
      expect(await code(['--check'])).toBe(0);
    });

    test('--write writes the file, and a second run finds nothing', async () => {
      write('src/a.ts', redundant);

      expect(await code(['--write'])).toBe(0);
      expect(read('src/a.ts')).toBe("const name: string = 'x';\nexport const label = name;\n");
      expect(await code(['--check'])).toBe(0);
    });

    test('--help prints the usage and exits 0, an unknown flag exits 2, --write with --check exits 2', async () => {
      write('src/a.ts', redundant);

      expect(await code(['--help'])).toBe(0);
      expect(logs.join('\n')).toContain('Usage: devz codemod drop-redundant-casts');
      expect(await code(['--halp', '--write'])).toBe(2);
      expect(await code(['--write', '--check'])).toBe(2);
      expect(await code(['--project'])).toBe(2);
      expect(read('src/a.ts')).toBe(redundant);
    });

    test('the report names how many casts stayed and why', async () => {
      write('src/a.ts', `${redundant}export const tuple = ['a'] as const;\n`);

      await code([]);

      expect(logs.join('\n')).toContain('(1 removed, 1 kept: 1 as-const)');
      expect(logs.join('\n')).toContain(
        '1 cast(s) would be removed in 1 file(s), 1 kept (1 as-const)',
      );
    });

    test('a file with no tsconfig above it is named in a warning and skipped', async () => {
      rmSync(join(root, 'tsconfig.json'));
      write('src/a.ts', redundant);

      expect(await code([])).toBe(0);
      expect(warnings.join('\n')).toContain('no tsconfig.json');
      expect(read('src/a.ts')).toBe(redundant);
    });

    test('devz codemod dispatches to it, and --help lists both codemods', async () => {
      write('src/a.ts', redundant);

      expect(await CodemodCommand.run({ root, args: ['drop-redundant-casts', '--check'] })).toBe(1);
      logs.length = 0;
      expect(await CodemodCommand.run({ root, args: ['--help'] })).toBe(0);
      expect(logs.join('\n')).toContain('devz codemod model-settings');
      expect(logs.join('\n')).toContain('devz codemod drop-redundant-casts');
    });

    test('--include-tests tries the casts of a test file', async () => {
      write('src/__tests__/a.test.ts', redundant);

      expect(await code(['--check'])).toBe(0);
      expect(await code(['--check', '--include-tests'])).toBe(1);
    });

    test('--project names the tsconfig, in both spellings', async () => {
      write('src/a.ts', redundant);
      writeFileSync(join(root, 'check.tsconfig.json'), TSCONFIG);

      expect(await code(['--check', '--project', 'check.tsconfig.json'])).toBe(1);
      expect(await code(['--check', '--project=check.tsconfig.json'])).toBe(1);
      expect(await code(['--check', '--project', '--write'])).toBe(2);
    });

    test('a git-ignored folder is not read', async () => {
      mkdirSync(join(root, 'src/generated'));
      write('.gitignore', 'src/generated/\n');
      write('src/generated/a.ts', redundant);

      expect(await code(['--write'])).toBe(0);
      expect(read('src/generated/a.ts')).toBe(redundant);
    });
  });
});
