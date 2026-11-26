import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { AnyAliases } from '../cli/codemod/any-aliases';
import { CliOutput } from '../common/cli-output';

const rewrite = (source: string, fileName = 'file.ts') =>
  AnyAliases.rewrite({ typescript: ts, fileName, source });

const rewriteStrict = (source: string, fileName = 'file.ts') =>
  AnyAliases.rewrite({ typescript: ts, fileName, source, isStrict: true });

const HERITAGE_REASON =
  'in a heritage clause: extends any, extends unknown and implements are not valid, name the members you mean';

describe('devz codemod any-aliases: the rewrite', () => {
  test('AnyType becomes any and AnyObject becomes Record<string | symbol | number, any> by default, and the import loses the names', () => {
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
        `const bag: Record<string, any> = {};`,
        `interface IResult<TData = any> { data: TData }`,
        `const log = (value: any, source: Record<string | symbol | number, any>): Record<string | symbol | number, any>[] => [source];`,
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

      expect(result.output).toBe(`export const value: any = 1;\n`);
    }
  });

  test('the ARDOR packages that re-exported the aliases are sources too, and an unrelated @venizia package is not', () => {
    for (const specifier of ['@venizia/ardor', '@venizia/ardor-kernel', '@venizia/ardor/common']) {
      const result = rewrite(
        `import type { AnyObject, AnyType } from '${specifier}';\nexport const a: AnyType = 1;\nexport const b: AnyObject = {};\n`,
      );

      expect(result.output).toBe(
        `export const a: any = 1;\nexport const b: Record<string | symbol | number, any> = {};\n`,
      );
    }

    const other = rewrite(
      `import type { AnyType } from '@venizia/ardor-react';\nexport const a: AnyType = 1;\n`,
    );

    expect(other.changed).toBe(false);
    expect(other.local).toEqual([{ line: 1, name: 'AnyType' }]);
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
        `const a: any = 1;`,
        `const b: Record<string | symbol | number, any> = {};`,
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

    expect(result.output).toContain(`type A = any;`);
    expect(result.output).toContain(
      `interface IOptions extends Record<string | symbol | number, any> { extra: string }`,
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
    expect(result.manual.map((item) => item.line)).toEqual([1, 3]);
  });

  test('an import("...") type is manual', () => {
    const result = rewrite(
      [
        `import type { AnyType } from '@venizia/ignis-helpers';`,
        `type A = import('@venizia/ignis-helpers').AnyObject;`,
        `export const a: AnyType = 1;`,
        '',
      ].join('\n'),
    );

    expect(result.manual.map((item) => item.line)).toEqual([2]);
    expect(result.output).toContain(`type A = import('@venizia/ignis-helpers').AnyObject;`);
    expect(result.output).toContain(`export const a: any = 1;`);
  });

  test('a type parameter named like the alias shadows only its own scope: that use is left and listed, the rest is rewritten', () => {
    const source = [
      `import type { AnyType } from '@venizia/ignis-helpers';`,
      `export const f = <AnyType>(value: AnyType) => value;`,
      `export class Box<AnyType> { value?: AnyType }`,
      `export type Pick2<TValue> = TValue extends Array<infer AnyType> ? AnyType : never;`,
      `export const outer: AnyType = 1;`,
      '',
    ].join('\n');
    const result = rewrite(source);

    expect(result.output).toBe(
      [
        `export const f = <AnyType>(value: AnyType) => value;`,
        `export class Box<AnyType> { value?: AnyType }`,
        `export type Pick2<TValue> = TValue extends Array<infer AnyType> ? AnyType : never;`,
        `export const outer: any = 1;`,
        '',
      ].join('\n'),
    );
    expect(result.rewritten).toBe(1);
    expect(result.local.map((item) => item.line)).toEqual([2, 3, 4]);
    expect(rewrite(result.output).changed).toBe(false);
  });

  test('an infer name is bound in the true branch only: the checked type, the extends clause and the false branch use the import', () => {
    const source = [
      `import type { AnyType } from '@venizia/ignis-helpers';`,
      `export type U<TValue> = TValue extends Array<infer AnyType> ? AnyType : AnyType;`,
      `export type Y<TValue> = TValue extends [infer AnyType, AnyType] ? 1 : 0;`,
      '',
    ].join('\n');
    const result = rewrite(source);

    expect(result.output).toBe(
      [
        `export type U<TValue> = TValue extends Array<infer AnyType> ? AnyType : any;`,
        `export type Y<TValue> = TValue extends [infer AnyType, any] ? 1 : 0;`,
        '',
      ].join('\n'),
    );
    expect(result.rewritten).toBe(2);
    expect(rewrite(result.output).changed).toBe(false);
  });

  test('a type declared in a namespace or a function shadows the alias there: left and listed, the file-level use is rewritten', () => {
    const source = [
      `import type { AnyObject, AnyType } from '@venizia/ignis-helpers';`,
      `namespace N {`,
      `  type AnyType = string;`,
      `  export const s: AnyType = 'a';`,
      `}`,
      `export function f(): number {`,
      `  interface AnyObject { id: number }`,
      `  const value: AnyObject = { id: 1 };`,
      `  return value.id;`,
      `}`,
      `export const a: AnyType = 1;`,
      `export const b: AnyObject = {};`,
      '',
    ].join('\n');
    const result = rewrite(source);

    expect(result.output).toBe(
      [
        `namespace N {`,
        `  type AnyType = string;`,
        `  export const s: AnyType = 'a';`,
        `}`,
        `export function f(): number {`,
        `  interface AnyObject { id: number }`,
        `  const value: AnyObject = { id: 1 };`,
        `  return value.id;`,
        `}`,
        `export const a: any = 1;`,
        `export const b: Record<string | symbol | number, any> = {};`,
        '',
      ].join('\n'),
    );
    expect(result.rewritten).toBe(2);
    expect(result.manual).toEqual([]);
    expect(result.local).toEqual([
      { line: 3, name: 'AnyType' },
      { line: 7, name: 'AnyObject' },
    ]);
    expect(rewrite(result.output).changed).toBe(false);
  });

  test('a heritage clause that a local declaration shadows does not keep the import', () => {
    const result = rewrite(
      [
        `import type { AnyType } from '@venizia/ignis-helpers';`,
        `export function f() {`,
        `  interface AnyType { id: number }`,
        `  interface IChild extends AnyType {}`,
        `  return {} as IChild;`,
        `}`,
        `export const a: AnyType = 1;`,
        '',
      ].join('\n'),
    );

    expect(result.manual).toEqual([]);
    expect(result.output).toContain(`interface IChild extends AnyType {}`);
    expect(result.output).toContain(`export const a: any = 1;`);
    expect(result.output).not.toContain(`import type`);
  });

  test('AnyType in a heritage clause is manual (extends any and extends unknown are invalid) and keeps its import; AnyObject there is rewritten', () => {
    const source = [
      `import type { AnyObject, AnyType } from '@venizia/ignis-helpers';`,
      `export interface IBag extends AnyObject { id: string }`,
      `export interface ILoose extends AnyType {}`,
      `export class Impl implements AnyType {}`,
      '',
    ].join('\n');
    const result = rewrite(source);

    expect(result.output).toContain(`import type { AnyType } from '@venizia/ignis-helpers';`);
    expect(result.output).toContain(
      `export interface IBag extends Record<string | symbol | number, any> { id: string }`,
    );
    expect(result.output).toContain(`export interface ILoose extends AnyType {}`);
    expect(result.manual.map((item) => item.line)).toEqual([3, 4]);
  });

  test('a namespace-qualified heritage clause is followed: AnyObject is rewritten, AnyType is manual', () => {
    const result = rewrite(
      [
        `import * as H from '@venizia/ignis-helpers';`,
        `export interface IBag extends H.AnyObject { id: string }`,
        `export interface ILoose extends H.AnyType {}`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(
      `export interface IBag extends Record<string | symbol | number, any> { id: string }`,
    );
    expect(result.output).toContain(`export interface ILoose extends H.AnyType {}`);
    expect(result.manual.map((item) => item.line)).toEqual([3]);
  });

  test('an aliased name that the file re-exports is manual with both names, and a re-export of a same-file type is only local', () => {
    const aliased = rewrite(
      [
        `import type { AnyObject as Bag } from '@venizia/ignis-helpers';`,
        `export type { Bag };`,
        '',
      ].join('\n'),
    );

    expect(aliased.changed).toBe(false);
    expect(aliased.manual).toHaveLength(1);
    expect(aliased.manual[0]?.reason).toContain('Bag (the alias AnyObject) is re-exported');

    const local = rewrite([`type AnyType = number;`, `export type { AnyType };`, ''].join('\n'));

    expect(local.manual).toEqual([]);
    expect(local.local).toEqual([{ line: 1, name: 'AnyType' }]);
  });

  test('a multi-line import keeps its layout and its comments, and an emptied import leaves no blank line', () => {
    const multi = rewrite(
      [
        `import type {`,
        `  // the class type`,
        `  TClass,`,
        `  AnyType,`,
        `  TNullable, // nullable`,
        `} from '@venizia/ignis-helpers';`,
        `export const a: AnyType = 1;`,
        '',
      ].join('\n'),
    );

    expect(multi.output).toBe(
      [
        `import type {`,
        `  // the class type`,
        `  TClass,`,
        `  TNullable, // nullable`,
        `} from '@venizia/ignis-helpers';`,
        `export const a: any = 1;`,
        '',
      ].join('\n'),
    );

    const comments = rewrite(
      [
        `import type {`,
        `  TClass, // the base`,
        `  AnyType, // gone`,
        `  // about nullable`,
        `  TNullable, // nullable`,
        `  AnyObject, // gone too`,
        `  TValue, // the value`,
        `} from '@venizia/ignis-helpers';`,
        `export const a: AnyType = 1;`,
        `export const b: AnyObject = {};`,
        '',
      ].join('\n'),
    );

    expect(comments.output).toBe(
      [
        `import type {`,
        `  TClass, // the base`,
        `  // about nullable`,
        `  TNullable, // nullable`,
        `  TValue, // the value`,
        `} from '@venizia/ignis-helpers';`,
        `export const a: any = 1;`,
        `export const b: Record<string | symbol | number, any> = {};`,
        '',
      ].join('\n'),
    );
    expect(rewrite(comments.output).changed).toBe(false);

    const emptied = rewrite(
      [
        `import type { AnyType } from '@venizia/ignis-helpers';`,
        '',
        `export const a: AnyType = 1;`,
        '',
      ].join('\n'),
    );

    expect(emptied.output).toBe(`export const a: any = 1;\n`);
  });

  test('two adjacent imports that are both emptied leave no blank line at the top of the file', () => {
    const adjacent = rewrite(
      [
        `import type { AnyType } from '@venizia/ignis-helpers';`,
        `import type { AnyObject } from '@venizia/ignis-inversion';`,
        '',
        `export const a: AnyType = 1;`,
        `export const b: AnyObject = {};`,
        '',
      ].join('\n'),
    );

    expect(adjacent.output).toBe(
      [
        `export const a: any = 1;`,
        `export const b: Record<string | symbol | number, any> = {};`,
        '',
      ].join('\n'),
    );
    expect(rewrite(adjacent.output).changed).toBe(false);

    const middle = rewrite(
      [
        `import { Other } from './other';`,
        '',
        `import type { AnyType } from '@venizia/ignis-helpers';`,
        `import type { AnyObject } from '@venizia/ignis-inversion';`,
        '',
        `export const a: AnyType = Other;`,
        `export const b: AnyObject = {};`,
        '',
      ].join('\n'),
    );

    expect(middle.output).toBe(
      [
        `import { Other } from './other';`,
        '',
        `export const a: any = Other;`,
        `export const b: Record<string | symbol | number, any> = {};`,
        '',
      ].join('\n'),
    );
  });

  test('with isStrict the same source gives unknown and Record<string, unknown>, and a second strict run changes nothing', () => {
    const source = [
      `import type { AnyObject, AnyType, TClass } from '@venizia/ignis-helpers';`,
      `const bag: Record<string, AnyType> = {};`,
      `interface IResult<TData = AnyType> { data: TData }`,
      `const log = (value: AnyType, source: AnyObject): AnyObject[] => [source];`,
      '',
    ].join('\n');
    const result = rewriteStrict(source);

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

    const second = rewriteStrict(result.output);

    expect(second.changed).toBe(false);
    expect(second.output).toBe(result.output);
    expect(rewrite(result.output).changed).toBe(false);
  });

  test('the default run is idempotent on every shape it rewrites', () => {
    const source = [
      `import * as H from '@venizia/ignis-helpers';`,
      `import type { AnyObject, AnyType as Loose } from '@venizia/ignis-inversion';`,
      `export interface IBag extends AnyObject { id: string }`,
      `export type A = H.AnyType;`,
      `export const b: Loose = 1;`,
      '',
    ].join('\n');
    const first = rewrite(source);
    const second = rewrite(first.output);

    expect(first.changed).toBe(true);
    expect(first.output).toContain(`export type A = any;`);
    expect(first.output).toContain(`extends Record<string | symbol | number, any>`);
    expect(second.changed).toBe(false);
    expect(second.output).toBe(first.output);
  });

  test('AnyType in a heritage clause is manual in the default and the strict mode, with the same message and the import kept', () => {
    const source = [
      `import type { AnyObject, AnyType } from '@venizia/ignis-helpers';`,
      `import * as H from '@venizia/ignis-helpers';`,
      `export interface IBag extends AnyObject { id: string }`,
      `export interface ILoose extends AnyType {}`,
      `export class Impl implements AnyType {}`,
      `export interface IQualified extends H.AnyType {}`,
      '',
    ].join('\n');

    for (const result of [rewrite(source), rewriteStrict(source)]) {
      expect(result.output).toContain(`import type { AnyType } from '@venizia/ignis-helpers';`);
      expect(result.output).toContain(`export interface ILoose extends AnyType {}`);
      expect(result.output).toContain(`export class Impl implements AnyType {}`);
      expect(result.output).toContain(`export interface IQualified extends H.AnyType {}`);
      expect(result.manual.map((item) => item.line)).toEqual([4, 5, 6]);
      expect(result.manual.map((item) => item.reason)).toEqual([
        `AnyType ${HERITAGE_REASON}`,
        `AnyType ${HERITAGE_REASON}`,
        `H.AnyType ${HERITAGE_REASON}`,
      ]);
    }

    expect(rewrite(source).output).toContain(
      `export interface IBag extends Record<string | symbol | number, any> { id: string }`,
    );
    expect(rewriteStrict(source).output).toContain(
      `export interface IBag extends Record<string, unknown> { id: string }`,
    );
  });

  test('the rewritten files type-check, in the default mode and with isStrict: no syntax or semantic error is left in the output', () => {
    const fixture = [
      `import type { AnyObject, AnyType } from '@venizia/ignis-helpers';`,
      `export const bag: Record<string, AnyType> = {};`,
      `export interface IResult<TData = AnyType> { data: TData }`,
      `export const log = (value: AnyType, source: AnyObject): AnyObject[] => [source];`,
      `export interface IOptions extends AnyObject { extra: string }`,
      '',
    ].join('\n');

    const diagnose = (output: string): string[] => {
      const fileName = '/virtual/fixture.ts';
      const options: import('typescript').CompilerOptions = {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        lib: ['lib.es2022.d.ts'],
        types: [],
      };
      const host = ts.createCompilerHost(options);
      const getSourceFile = host.getSourceFile.bind(host);

      host.getSourceFile = (name, languageVersion, ...rest) =>
        name === fileName
          ? ts.createSourceFile(name, output, languageVersion, true)
          : getSourceFile(name, languageVersion, ...rest);
      host.fileExists = (name) => name === fileName || ts.sys.fileExists(name);
      host.readFile = (name) => (name === fileName ? output : ts.sys.readFile(name));

      const program = ts.createProgram([fileName], options, host);

      return [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()].map(
        (item) => ts.flattenDiagnosticMessageText(item.messageText, ' '),
      );
    };

    const loose = rewrite(fixture).output;
    const tight = rewriteStrict(fixture).output;

    expect(loose).toContain('Record<string | symbol | number, any>');
    expect(tight).toContain('Record<string, unknown>');
    expect(diagnose(loose)).toEqual([]);
    expect(diagnose(tight)).toEqual([]);
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

    expect(result.output).toContain(`props: { value: any }`);
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
    spyOn(CliOutput, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    spyOn(CliOutput, 'warn').mockImplementation((...args) => {
      warnings.push(args.join(' '));
    });
    spyOn(CliOutput, 'error').mockImplementation((...args) => {
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
  const NEW = `export const a: any = 1;\n`;

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

  test('--strict writes unknown and Record<string, unknown>, and a second strict run is clean', async () => {
    commit({
      'src/a.ts': `import type { AnyObject, AnyType } from '@venizia/ignis-helpers';\nexport const a: AnyType = 1;\nexport const b: AnyObject = {};\n`,
    });

    const code = await CodemodCommand.run({
      root,
      args: ['any-aliases', '--strict', '--write', '--all'],
    });

    expect(code).toBe(0);
    expect(read('src/a.ts')).toBe(
      `export const a: unknown = 1;\nexport const b: Record<string, unknown> = {};\n`,
    );

    execFileSync('git', ['add', '-A'], { cwd: root });
    logs.length = 0;

    const second = await CodemodCommand.run({ root, args: ['any-aliases', '--strict', '--check'] });

    expect(second).toBe(0);
    expect(logs.join('\n')).toContain('0 file(s) would change');
  });

  test('--strict on a dry run names the typecheck follow-up, and the default dry run does not', async () => {
    commit({ 'src/a.ts': OLD });

    await CodemodCommand.run({ root, args: ['any-aliases', '--strict'] });

    expect(read('src/a.ts')).toBe(OLD);
    expect(logs.join('\n')).toContain('would change  src/a.ts  (1 reference(s))');
    expect(logs.join('\n')).toContain('a value an alias used to accept may need a type alias');

    logs.length = 0;
    await CodemodCommand.run({ root, args: ['any-aliases'] });
    expect(logs.join('\n')).not.toContain('a value an alias used to accept may need a type alias');
  });

  test('a heritage use is manual under --check in both modes: --check exits 1 and lists it', async () => {
    commit({
      'src/h.ts': `import type { AnyType } from '@venizia/ignis-helpers';\nexport interface ILoose extends AnyType {}\n`,
    });

    for (const args of [
      ['any-aliases', '--check'],
      ['any-aliases', '--strict', '--check'],
    ]) {
      warnings.length = 0;

      const code = await CodemodCommand.run({ root, args });

      expect(code).toBe(1);
      expect(warnings.join('\n')).toContain(`manual  src/h.ts:2  AnyType ${HERITAGE_REASON}`);
    }
  });

  test('--strict is a known flag and --nope is a usage error with exit 2', async () => {
    commit({ 'src/a.ts': OLD });

    const known = await CodemodCommand.run({ root, args: ['any-aliases', '--strict'] });

    expect(known).toBe(0);
    expect(errors).toEqual([]);

    const unknown = await CodemodCommand.run({ root, args: ['any-aliases', '--nope'] });

    expect(unknown).toBe(2);
    expect(errors.join('\n')).toContain('unknown option "--nope"');
    expect(errors.join('\n')).toContain('--strict');
    expect(read('src/a.ts')).toBe(OLD);
  });

  test('--reverse is refused with exit 2, and the codemod is listed', async () => {
    const code = await CodemodCommand.run({ root, args: ['any-aliases', '--reverse'] });

    expect(code).toBe(2);

    logs.length = 0;
    await CodemodCommand.run({ root, args: ['--list'] });
    expect(logs.join('\n')).toContain('any-aliases');
  });
});
