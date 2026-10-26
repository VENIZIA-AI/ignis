import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { ConstClasses, ConstClassesCommand } from '../cli/codemod/const-classes';

const convert = (source: string, overrides = {}) =>
  ConstClasses.convert({
    typescript: ts,
    fileName: 'a.ts',
    source,
    relativePath: 'src/a.ts',
    overrides,
  });

const IMPORT = "import type { TConstValue } from '@venizia/ignis-helpers/common';";

describe('ConstClasses.convert - an exported type alias', () => {
  test('becomes a const class and TConstValue, in the shape the repository uses', () => {
    const result = convert("export type TMode = 'read' | 'write';\n");

    expect(result.output).toBe(
      [
        IMPORT,
        '',
        '/** The values of `TMode`. */',
        'export class Modes {',
        "  static readonly READ = 'read';",
        "  static readonly WRITE = 'write';",
        '',
        '  static readonly SCHEME_SET = new Set<string>([this.READ, this.WRITE]);',
        '',
        '  static isValid(value: string): value is TMode {',
        '    return this.SCHEME_SET.has(value);',
        '  }',
        '}',
        '',
        'export type TMode = TConstValue<typeof Modes>;',
        '',
      ].join('\n'),
    );
    expect(result.proposals[0]).toMatchObject({
      id: 'src/a.ts#TMode',
      className: 'Modes',
      typeName: 'TMode',
    });
  });

  test('keeps a null or undefined member next to the class type', () => {
    const result = convert("export type TMode = 'read' | 'write' | null | undefined;\n");

    expect(result.output).toContain(
      'export type TMode = TConstValue<typeof Modes> | null | undefined;',
    );
  });

  test('keeps the comment of the alias with the alias, and puts the class above it', () => {
    const result = convert("/** How a file is opened. */\nexport type TMode = 'read' | 'write';\n");

    expect(result.output.indexOf('export class Modes')).toBeLessThan(
      result.output.indexOf('/** How a file is opened. */'),
    );
    expect(result.output).toContain(
      '/** How a file is opened. */\nexport type TMode = TConstValue<typeof Modes>;',
    );
  });

  test('a multi-line union is read whole', () => {
    const result = convert("export type TMode =\n  | 'read'\n  | 'write'\n  | 'append';\n");

    expect(result.proposals[0]?.members.map((member) => member.key)).toEqual([
      'READ',
      'WRITE',
      'APPEND',
    ]);
  });

  test.each([
    ['TStatus', 'Statuses'],
    ['TPolicy', 'Policies'],
    ['TBox', 'Boxes'],
    ['TSettings', 'Settings'],
    ['TQueueReason', 'QueueReasons'],
    ['Mode', 'Modes'],
  ])('%s gives the class %s', (name, className) => {
    const result = convert(`export type ${name} = 'a' | 'b';\n`);

    expect(result.proposals[0]?.className).toBe(className);
  });

  test.each([
    ['read-only', 'READ_ONLY'],
    ['readOnly', 'READ_ONLY'],
    ['read.only', 'READ_ONLY'],
    ['string[]', 'STRING_ARRAY'],
    ['2fa', '_2FA'],
    ['ALREADY', 'ALREADY'],
  ])('the value %s gives the member %s', (value, key) => {
    const result = convert(`export type TKind = '${value}' | 'other';\n`);

    expect(result.proposals[0]?.members[0]).toEqual({ value, key });
  });
});

describe('ConstClasses.convert - a property of an exported interface or object type', () => {
  test('gets a class and a type above the container, and the property uses the type', () => {
    const result = convert("export interface IOptions {\n  storage?: 'memory' | 'disk';\n}\n");

    expect(result.output).toContain('export class OptionsStorages {');
    expect(result.output).toContain(
      'export type TOptionsStorage = TConstValue<typeof OptionsStorages>;',
    );
    expect(result.output).toContain('  storage?: TOptionsStorage;');
    expect(result.output.indexOf('export class OptionsStorages')).toBeLessThan(
      result.output.indexOf('export interface IOptions'),
    );
  });

  test('several properties of one container each get their own class', () => {
    const result = convert(
      "export interface IOptions {\n  storage: 'memory' | 'disk';\n  mode: 'a' | 'b' | null;\n}\n",
    );

    expect(result.proposals.map((proposal) => proposal.className)).toEqual([
      'OptionsStorages',
      'OptionsModes',
    ]);
    expect(result.output).toContain('  mode: TOptionsMode | null;');
  });

  test('an object type alias works like an interface', () => {
    const result = convert("export type TOptions = { storage: 'memory' | 'disk' };\n");

    expect(result.output).toContain('export class OptionsStorages {');
    expect(result.output).toContain('export type TOptions = { storage: TOptionsStorage };');
  });
});

describe('ConstClasses.convert - what it leaves alone', () => {
  test('a declaration that is not exported, a union with a non-literal member, and a single literal', () => {
    const result = convert(
      [
        "type TPrivate = 'a' | 'b';",
        "export type TWide = 'a' | 'b' | number;",
        "export type TOne = 'a';",
        '',
      ].join('\n'),
    );

    expect(result.changed).toBe(false);
    expect(result.untouched).toEqual([]);
  });

  test('key sets are not enumerable values', () => {
    const result = convert(
      [
        "export type TA = Pick<{ a: 1; b: 2 }, 'a' | 'b'>;",
        "export type TB = Omit<{ a: 1; b: 2 }, 'a' | 'b'>;",
        "export type TC = Extract<'a' | 'b' | 'c', 'a' | 'b'>;",
        "export type TD = Record<'a' | 'b', number>;",
        "export type TE = { [K in 'a' | 'b']: number };",
        '',
      ].join('\n'),
    );

    expect(result.changed).toBe(false);
    expect(result.untouched).toEqual([]);
  });

  test('a union in a parameter, a return type or a generic is reported, never guessed', () => {
    const result = convert(
      [
        "export const run = (mode: 'a' | 'b') => mode;",
        "export function pick(): 'x' | 'y' { return 'x'; }",
        "export type TBox<T extends 'p' | 'q'> = T;",
        '',
      ].join('\n'),
    );

    expect(result.changed).toBe(false);
    expect(result.untouched).toHaveLength(3);
    expect(result.untouched[0]?.reason).toContain('no name to give it');
    expect(result.untouched[0]?.line).toBe(1);
  });

  test('a name already used in the file is reported and nothing changes', () => {
    const result = convert("export class Modes {}\nexport type TMode = 'read' | 'write';\n");

    expect(result.changed).toBe(false);
    expect(result.untouched[0]?.reason).toContain('Modes is already used');
    expect(result.untouched[0]?.reason).toContain('src/a.ts#TMode');
  });

  test('two values that give one member are reported', () => {
    const result = convert("export type TMode = 'read-only' | 'readOnly';\n");

    expect(result.changed).toBe(false);
    expect(result.untouched[0]?.reason).toContain('two values give the member READ_ONLY');
  });

  test('a value that gives the reserved member is reported', () => {
    const result = convert("export type TMode = 'scheme_set' | 'other';\n");

    expect(result.untouched[0]?.reason).toContain('reserved member SCHEME_SET');
  });
});

describe('ConstClasses.convert - the mapping file and the import', () => {
  test('an override renames the class and a member', () => {
    const result = convert("export type TMode = 'read-only' | 'write';\n", {
      'src/a.ts#TMode': { class: 'FileModes', members: { 'read-only': 'READONLY' } },
    });

    expect(result.output).toContain('export class FileModes {');
    expect(result.output).toContain("static readonly READONLY = 'read-only';");
    expect(result.output).toContain('TConstValue<typeof FileModes>');
  });

  test('an override may rename the type of a property, and may skip a declaration', () => {
    const renamed = convert("export interface IOptions {\n  storage: 'memory' | 'disk';\n}\n", {
      'src/a.ts#IOptions.storage': { type: 'TStorageKind', class: 'StorageKinds' },
    });
    const skipped = convert("export type TMode = 'read' | 'write';\n", {
      'src/a.ts#TMode': { skip: true },
    });

    expect(renamed.output).toContain(
      'export type TStorageKind = TConstValue<typeof StorageKinds>;',
    );
    expect(skipped.changed).toBe(false);
    expect(skipped.untouched).toEqual([]);
  });

  test('an import from the same module gets a specifier; a file that has TConstValue gets nothing', () => {
    const same = convert(
      "import { getError } from '@venizia/ignis-helpers/common';\nexport type TMode = 'a' | 'b';\n",
    );
    const has = convert(
      "import type { TConstValue } from './mine';\nexport type TMode = 'a' | 'b';\n",
    );

    expect(same.output).toContain(
      "import { getError, type TConstValue } from '@venizia/ignis-helpers/common';",
    );
    expect(has.output.match(/TConstValue/g)).toHaveLength(2);
    expect(has.output).not.toContain('@venizia/ignis-helpers/common');
  });

  test('a new import goes after the last import', () => {
    const result = convert(
      "import { a } from './a';\nimport { b } from './b';\n\nexport type TMode = 'a' | 'b';\n",
    );

    expect(result.output).toContain(`import { b } from './b';\n${IMPORT}\n`);
  });

  test('running it on its own output changes nothing', () => {
    const first = convert("export type TMode = 'read' | 'write';\n");
    const second = convert(first.output);

    expect(second.changed).toBe(false);
    expect(second.proposals).toEqual([]);
  });
});

describe('devz codemod const-classes - the command', () => {
  let root: string;
  let logs: string[];
  let warnings: string[];
  let errors: string[];

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'consts-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'src/__tests__'), { recursive: true });
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

  const write = (path: string, content: string) => writeFileSync(join(root, path), content);
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const code = (args: string[]) => ConstClassesCommand.run({ root, args });
  const source = "export type TMode = 'read' | 'write';\n";

  test('without --write it prints the proposal, writes nothing and exits 0', async () => {
    write('src/a.ts', source);

    expect(await code([])).toBe(0);
    expect(read('src/a.ts')).toBe(source);
    expect(logs.join('\n')).toContain(
      "would convert  src/a.ts:1  TMode -> class Modes { READ = 'read', WRITE = 'write' }",
    );
    expect(logs.join('\n')).toContain('[src/a.ts#TMode]');
    expect(logs.join('\n')).toContain('Nothing was written');
  });

  test('--check exits 1 while a union can be converted or is left untouched, and 0 when neither', async () => {
    write('src/a.ts', source);
    expect(await code(['--check'])).toBe(1);

    write('src/a.ts', "export const run = (mode: 'a' | 'b') => mode;\n");
    expect(await code(['--check'])).toBe(1);
    expect(warnings.join('\n')).toContain('src/a.ts:1:');

    write('src/a.ts', 'export const value = 1;\n');
    expect(await code(['--check'])).toBe(0);
  });

  test('--write converts the file, and a second run finds nothing', async () => {
    write('src/a.ts', source);

    expect(await code(['--write'])).toBe(0);
    expect(read('src/a.ts')).toContain('export class Modes {');
    expect(await code(['--check'])).toBe(0);
  });

  test('the converted file typechecks, and the old literals still fit the type', async () => {
    write('src/helpers.ts', 'export type TConstValue<T> = Extract<T[keyof T], string> & {};\n');
    write(
      'src/a.ts',
      "export type TMode = 'read' | 'write';\nexport const mode: TMode = 'read';\nexport const same = (value: TMode) => value === 'write';\n",
    );
    write(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'es2022',
          module: 'esnext',
          moduleResolution: 'bundler',
          noEmit: true,
          types: [],
        },
        include: ['src'],
      }),
    );

    expect(await code(['--write', '--import-from', './helpers'])).toBe(0);

    const configFile = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const messages = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

    expect(read('src/a.ts')).toContain("import type { TConstValue } from './helpers';");
    expect(messages).toEqual([]);
  });

  test('--emit-map writes the proposals, and --map applies the edited names', async () => {
    write('src/a.ts', source);

    expect(await code(['--emit-map', 'names.json'])).toBe(0);
    const emitted = JSON.parse(read('names.json'));
    expect(emitted['src/a.ts#TMode']).toEqual({
      class: 'Modes',
      members: { read: 'READ', write: 'WRITE' },
    });

    emitted['src/a.ts#TMode'].class = 'FileModes';
    write('names.json', JSON.stringify(emitted));
    expect(await code(['--write', '--map', 'names.json'])).toBe(0);
    expect(read('src/a.ts')).toContain('export class FileModes {');
  });

  test('a mapping file that cannot be read exits 2 and writes nothing', async () => {
    write('src/a.ts', source);
    write('bad.json', '[1, 2]');

    expect(await code(['--write', '--map', 'bad.json'])).toBe(2);
    expect(await code(['--write', '--map', 'missing.json'])).toBe(2);
    expect(errors.join('\n')).toContain('cannot read the mapping file');
    expect(read('src/a.ts')).toBe(source);
  });

  test('--help exits 0; an unknown flag, --write with --check and a flag without its value exit 2', async () => {
    write('src/a.ts', source);

    expect(await code(['--help'])).toBe(0);
    expect(logs.join('\n')).toContain('Usage: devz codemod const-classes');
    expect(await code(['--halp', '--write'])).toBe(2);
    expect(await code(['--write', '--check'])).toBe(2);
    expect(await code(['--map'])).toBe(2);
    expect(read('src/a.ts')).toBe(source);
  });

  test('test files are skipped unless --include-tests is given, and ignored folders are never read', async () => {
    write('src/__tests__/a.test.ts', source);
    expect(await code(['--check'])).toBe(0);
    expect(await code(['--check', '--include-tests'])).toBe(1);

    mkdirSync(join(root, 'src/generated'));
    write('.gitignore', 'src/generated/\n');
    write('src/generated/b.ts', "export type TOther = 'a' | 'b';\n");
    rmSync(join(root, 'src/__tests__/a.test.ts'));
    expect(await code(['--check'])).toBe(0);
  });

  test('devz codemod dispatches to it, and --help lists all three codemods', async () => {
    write('src/a.ts', source);

    expect(await CodemodCommand.run({ root, args: ['const-classes', '--check'] })).toBe(1);
    logs.length = 0;
    expect(await CodemodCommand.run({ root, args: ['--help'] })).toBe(0);
    expect(logs.join('\n')).toContain('devz codemod model-settings');
    expect(logs.join('\n')).toContain('devz codemod drop-redundant-casts');
    expect(logs.join('\n')).toContain('devz codemod const-classes');
  });
});
