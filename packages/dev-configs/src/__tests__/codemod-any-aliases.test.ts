import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { AnyAliases } from '../cli/codemod/any-aliases';

const rewrite = (source: string, fileName = 'file.ts') =>
  AnyAliases.rewrite({ typescript: ts, fileName, source });

describe('devz codemod any-aliases: the rewrite', () => {
  test('AnyType becomes unknown and AnyObject becomes Record<string, unknown>, and the import loses the names', () => {
    const result = rewrite(
      [
        `import type { AnyObject, AnyType, TClass } from '@venizia/ignis-helpers';`,
        `const bag: Record<string, AnyType> = {};`,
        `interface IResult<TData = AnyType> { data: TData }`,
        `const log = (value: AnyType, source: AnyObject): AnyObject[] => [source];`,
        '',
      ].join('\n'),
    );

    expect(result.output).toBe(
      [
        `import type { TClass } from '@venizia/ignis-helpers';`,
        `const bag: Record<string, unknown> = {};`,
        `interface IResult<TData = unknown> { data: TData }`,
        `const log = (value: unknown, source: Record<string, unknown>): Record<string, unknown>[] => [source];`,
        '',
      ].join('\n'),
    );
    expect(result.rewritten).toBe(5);
    expect(result.manual).toEqual([]);
    expect(result.local).toEqual([]);
  });

  test('an import left empty is dropped, on every IGNIS module and sub-path', () => {
    for (const specifier of [
      '@venizia/ignis',
      '@venizia/ignis-helpers',
      '@venizia/ignis-helpers/common',
      '@venizia/ignis-inversion',
    ]) {
      const result = rewrite(
        `import { type AnyType } from '${specifier}';\nexport const value: AnyType = 1;\n`,
      );

      expect(result.output).toBe(`export const value: unknown = 1;\n`);
    }
  });

  test('an `as` alias is followed, and a default import beside the names stays', () => {
    const result = rewrite(
      [
        `import Helpers, { AnyType as Loose, AnyObject as Bag } from '@venizia/ignis-helpers';`,
        `const a: Loose = 1;`,
        `const b: Bag = {};`,
        '',
      ].join('\n'),
    );

    expect(result.output).toBe(
      [
        `import Helpers from '@venizia/ignis-helpers';`,
        `const a: unknown = 1;`,
        `const b: Record<string, unknown> = {};`,
        '',
      ].join('\n'),
    );
  });

  test('a namespace import and a heritage clause are followed', () => {
    const result = rewrite(
      [
        `import * as Helpers from '@venizia/ignis-helpers';`,
        `import type { AnyObject } from '@venizia/ignis-helpers';`,
        `type A = Helpers.AnyType;`,
        `interface IOptions extends AnyObject { extra: string }`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(`type A = unknown;`);
    expect(result.output).toContain(
      `interface IOptions extends Record<string, unknown> { extra: string }`,
    );
    expect(result.output).not.toContain(`import type { AnyObject }`);
  });

  test('a same-named type that is not the IGNIS alias is left alone and listed', () => {
    const source = [
      `import type { AnyType } from './local-types';`,
      `type AnyObject = Record<string, number>;`,
      `export const a: AnyType = 1;`,
      `export const b: AnyObject = {};`,
      '',
    ].join('\n');
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
    expect(result.local).toEqual([
      { line: 1, name: 'AnyType' },
      { line: 2, name: 'AnyObject' },
    ]);
  });

  test('a re-export is manual and keeps its import', () => {
    const source = [
      `import type { AnyType } from '@venizia/ignis-helpers';`,
      `export type { AnyType };`,
      `export type { AnyObject } from '@venizia/ignis-helpers';`,
      '',
    ].join('\n');
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.manual.map((item) => item.line)).toEqual([2, 3]);
  });

  test('an import("...") type and a type parameter of the same name are manual', () => {
    const result = rewrite(
      [
        `import type { AnyType } from '@venizia/ignis-helpers';`,
        `type A = import('@venizia/ignis-helpers').AnyObject;`,
        `const f = <AnyType>(value: AnyType) => value;`,
        '',
      ].join('\n'),
    );

    expect(result.manual.map((item) => item.line)).toEqual([1, 2]);
    expect(result.output).toContain(`import type { AnyType } from '@venizia/ignis-helpers';`);
  });

  test('a second run changes nothing', () => {
    const first = rewrite(
      `import type { AnyType, TClass } from '@venizia/ignis-helpers';\nconst a: AnyType = 1;\n`,
    );
    const second = rewrite(first.output);

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.output).toBe(first.output);
  });

  test('a file with no import of the aliases is not touched', () => {
    const source = `const a: unknown = 1;\n`;

    expect(rewrite(source).changed).toBe(false);
  });

  test('a .tsx file is read', () => {
    const result = rewrite(
      `import type { AnyType } from '@venizia/ignis-helpers';\nconst View = (props: { value: AnyType }) => <div>{String(props.value)}</div>;\n`,
      'view.tsx',
    );

    expect(result.output).toContain(`props: { value: unknown }`);
  });
});

describe('devz codemod any-aliases: the command', () => {
  let root: string;
  let logs: string[];
  let warnings: string[];
  let errors: string[];

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'any-aliases-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'src'), { recursive: true });
    logs = [];
    warnings = [];
    errors = [];
    spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    spyOn(console, 'warn').mockImplementation((...args) => {
      warnings.push(args.join(' '));
    });
    spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const commit = (files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) {
      writeFileSync(join(root, path), content);
    }

    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '-q',
        '-m',
        'fixture',
      ],
      { cwd: root },
    );
  };

  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const OLD = `import type { AnyType } from '@venizia/ignis-helpers';\nexport const a: AnyType = 1;\n`;
  const NEW = `export const a: unknown = 1;\n`;

  test('a dry run lists the file and writes nothing', async () => {
    commit({ 'src/a.ts': OLD });

    const code = await CodemodCommand.run({ root, args: ['any-aliases'] });

    expect(code).toBe(0);
    expect(read('src/a.ts')).toBe(OLD);
    expect(logs.join('\n')).toContain('would change  src/a.ts  (1 reference(s))');
    expect(logs.join('\n')).toContain('Nothing was written');
  });

  test('--write --all rewrites the files and a second run is clean', async () => {
    commit({ 'src/a.ts': OLD, 'src/b.ts': 'export const b = 1;\n' });

    const code = await CodemodCommand.run({ root, args: ['any-aliases', '--write', '--all'] });

    expect(code).toBe(0);
    expect(read('src/a.ts')).toBe(NEW);
    expect(read('src/b.ts')).toBe('export const b = 1;\n');

    execFileSync('git', ['add', '-A'], { cwd: root });
    logs.length = 0;
    await CodemodCommand.run({ root, args: ['any-aliases', '--check'] });
    expect(logs.join('\n')).toContain('0 file(s) would change');
  });

  test('a bare --write with no path is refused', async () => {
    commit({ 'src/a.ts': OLD });

    const code = await CodemodCommand.run({ root, args: ['any-aliases', '--write'] });

    expect(code).toBe(2);
    expect(errors.join('\n')).toContain('--write needs a path, or --all');
    expect(read('src/a.ts')).toBe(OLD);
  });

  test('--write refuses a file with local changes and exits 1', async () => {
    commit({ 'src/a.ts': OLD });
    writeFileSync(join(root, 'src/a.ts'), `${OLD}// edited\n`);

    const code = await CodemodCommand.run({ root, args: ['any-aliases', '--write', 'src/a.ts'] });

    expect(code).toBe(1);
    expect(read('src/a.ts')).toBe(`${OLD}// edited\n`);
    expect(warnings.join('\n')).toContain('refused  src/a.ts  has local changes');
  });

  test('--check exits 1 while a file would change or a case is manual, and lists manual and local cases', async () => {
    commit({
      'src/a.ts': OLD,
      'src/m.ts': `export type { AnyObject } from '@venizia/ignis-helpers';\n`,
      'src/l.ts': `type AnyType = number;\nexport const l: AnyType = 1;\n`,
    });

    const code = await CodemodCommand.run({ root, args: ['any-aliases', '--check'] });

    expect(code).toBe(1);
    expect(warnings.join('\n')).toContain('manual  src/m.ts:1');
    expect(warnings.join('\n')).toContain('local  src/l.ts:1  AnyType');
  });

  test('--reverse is refused with exit 2, and the codemod is listed', async () => {
    const code = await CodemodCommand.run({ root, args: ['any-aliases', '--reverse'] });

    expect(code).toBe(2);

    logs.length = 0;
    await CodemodCommand.run({ root, args: ['--list'] });
    expect(logs.join('\n')).toContain('any-aliases');
  });
});
