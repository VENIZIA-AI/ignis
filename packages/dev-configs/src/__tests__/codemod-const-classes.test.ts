import { afterEach, beforeEach, describe, expect, spyOn, test, setDefaultTimeout } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { ConstClasses, ConstClassesCommand } from '../cli/codemod/const-classes';
import { CliOutput } from '../common/cli-output';

// The tests of this file run a compiler or a linter: over bun's 5 s default in a parallel run on a small CI runner.
setDefaultTimeout(30_000);

const convert = (source: string, overrides = {}) =>
  ConstClasses.convert({
    typescript: ts,
    fileName: 'a.ts',
    source,
    relativePath: 'src/a.ts',
    overrides,
  });

const IMPORT = "import { ConstClass, type TConstValue } from '@venizia/ignis-helpers/common';";

describe('ConstClasses.convert - an exported type alias', () => {
  test('becomes a const class and TConstValue, in the shape the repository uses', () => {
    const result = convert("export type TMode = 'read' | 'write';\n");

    expect(result.output).toBe(
      [
        IMPORT,
        '',
        'export class Modes extends ConstClass {',
        "  static readonly READ = 'read';",
        "  static readonly WRITE = 'write';",
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

  test('writes no comment of its own above the class, for an alias with a comment or without', () => {
    const bare = convert("export type TMode = 'read' | 'write';\n");
    const documented = convert(
      "/** How a file is opened. */\nexport type TMode = 'read' | 'write';\n",
    );

    expect(bare.output).not.toContain('/**');
    expect(bare.output).not.toContain('The values of');
    // the only comment is the author's own, and it stays with the alias
    expect(documented.output.match(/\/\*\*/g)).toHaveLength(1);
    expect(documented.output).not.toContain('The values of');
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

    expect(result.output).toContain('export class OptionsStorages extends ConstClass {');
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

    expect(result.output).toContain('export class OptionsStorages extends ConstClass {');
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
    const result = convert(
      "export class Modes extends ConstClass {}\nexport type TMode = 'read' | 'write';\n",
    );

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

    expect(result.output).toContain('export class FileModes extends ConstClass {');
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
      "import { getError, ConstClass, type TConstValue } from '@venizia/ignis-helpers/common';",
    );
    expect(has.output.match(/TConstValue/g)).toHaveLength(2);
    expect(has.output).toContain("import { ConstClass } from '@venizia/ignis-helpers/common';");
  });

  test('a type-only import from the same module is left alone and ConstClass gets its own line', () => {
    const result = convert(
      "import type { TConstValue } from '@venizia/ignis-helpers/common';\nexport type TMode = 'a' | 'b';\n",
    );

    expect(result.output).toContain(
      "import type { TConstValue } from '@venizia/ignis-helpers/common';\nimport { ConstClass } from '@venizia/ignis-helpers/common';\n",
    );
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

  const write = (path: string, content: string) => writeFileSync(join(root, path), content);
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const code = (args: string[]) => ConstClassesCommand.run({ root, args });
  const source = "export type TMode = 'read' | 'write';\n";

  test('without --write it prints the proposal, writes nothing and exits 0', async () => {
    write('src/a.ts', source);

    const result = await code([]);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toBe(source);
    expect(logs.join('\n')).toContain(
      "would convert  src/a.ts:1  TMode -> class Modes { READ = 'read', WRITE = 'write' }",
    );
    expect(logs.join('\n')).toContain('[src/a.ts#TMode]');
    expect(logs.join('\n')).toContain('Nothing was written');
  });

  test('--check exits 1 while a union can be converted or is left untouched, and 0 when neither', async () => {
    write('src/a.ts', source);
    const result = await code(['--check']);
    expect(result).toBe(1);

    write('src/a.ts', "export const run = (mode: 'a' | 'b') => mode;\n");
    const result2 = await code(['--check']);
    expect(result2).toBe(1);
    expect(warnings.join('\n')).toContain('src/a.ts:1:');

    write('src/a.ts', 'export const value = 1;\n');
    const result3 = await code(['--check']);
    expect(result3).toBe(0);
  });

  test('--write converts the file, and a second run finds nothing', async () => {
    write('src/a.ts', source);

    const result = await code(['--write', '--all']);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toContain('export class Modes extends ConstClass {');
    const result2 = await code(['--check']);
    expect(result2).toBe(0);
  });

  test('the converted file typechecks, and the old literals still fit the type', async () => {
    write(
      'src/helpers.ts',
      'export type TConstValue<T> = Extract<T[keyof T], string> & {};\nexport class ConstClass {}\n',
    );
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

    const result = await code(['--write', '--all', '--import-from', './helpers']);
    expect(result).toBe(0);

    const configFile = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const messages = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

    expect(read('src/a.ts')).toContain("import { ConstClass, type TConstValue } from './helpers';");
    expect(messages).toEqual([]);
  });

  test('a standard class moves to ConstClass and its callers read isValid and values()', async () => {
    write(
      'src/modes.ts',
      [
        "import { ConstClass as Base } from './elsewhere';",
        '',
        'export class Modes {',
        "  static readonly READ = 'read';",
        "  static readonly WRITE = 'write';",
        '',
        '  /** The values. */',
        '  static readonly SCHEME_SET = new Set<string>([this.READ, this.WRITE]);',
        '',
        '  static isValid(value: string): boolean {',
        '    return this.SCHEME_SET.has(value);',
        '  }',
        '}',
        '',
        'export class Keeps {',
        "  static readonly A = 'a';",
        '  static readonly OTHER = 1;',
        '  static readonly SCHEME_SET = new Set<string>([this.A]);',
        '}',
        'void Base;',
        '',
      ].join('\n'),
    );
    write(
      'src/use.ts',
      [
        "import { Modes, Keeps } from './modes';",
        'declare const input: string;',
        'export const ok = Modes.SCHEME_SET.has(input);',
        'export const all = [...Modes.SCHEME_SET];',
        'export const more = [0, ...Modes.SCHEME_SET];',
        'export const kept = Keeps.SCHEME_SET.has(input);',
        'export const size = Modes.SCHEME_SET.size;',
        '',
      ].join('\n'),
    );

    const dirtyRun = await code(['--write', '--all', '--import-from', './helpers']);
    expect(dirtyRun).toBe(1);
    expect(warnings.join('\n')).toContain('refused  src/modes.ts  has local changes');
    expect(read('src/modes.ts')).toContain('static readonly SCHEME_SET');

    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'i'], {
      cwd: root,
    });

    const dry = await code(['--import-from', './helpers']);
    expect(dry).toBe(0);
    expect(read('src/modes.ts')).toContain('static readonly SCHEME_SET');

    const result = await code(['--write', '--all', '--import-from', './helpers']);
    expect(result).toBe(0);
    expect(read('src/modes.ts')).toBe(
      [
        "import { ConstClass as Base } from './elsewhere';",
        "import { ConstClass } from './helpers';",
        '',
        'export class Modes extends ConstClass {',
        "  static readonly READ = 'read';",
        "  static readonly WRITE = 'write';",
        '}',
        '',
        'export class Keeps {',
        "  static readonly A = 'a';",
        '  static readonly OTHER = 1;',
        '  static readonly SCHEME_SET = new Set<string>([this.A]);',
        '}',
        'void Base;',
        '',
      ].join('\n'),
    );
    expect(read('src/use.ts')).toBe(
      [
        "import { Modes, Keeps } from './modes';",
        'declare const input: string;',
        'export const ok = Modes.isValid(input);',
        'export const all = Modes.values();',
        'export const more = [0, ...Modes.values()];',
        'export const kept = Keeps.SCHEME_SET.has(input);',
        'export const size = Modes.SCHEME_SET.size;',
        '',
      ].join('\n'),
    );
    expect(warnings.join('\n')).toContain('src/use.ts:7  Modes.SCHEME_SET is gone');
  });

  test('another static method stays on the class unless it reads the set', async () => {
    write(
      'src/phases.ts',
      [
        'export class Phases {',
        "  static readonly OPEN = 'open';",
        "  static readonly SHUT = 'shut';",
        '  static readonly SCHEME_SET = new Set<string>([this.OPEN, this.SHUT]);',
        '  static isOpen(value: string): boolean {',
        '    return value === this.OPEN;',
        '  }',
        '}',
        '',
        'export class Reads {',
        "  static readonly A = 'a';",
        '  static readonly SCHEME_SET = new Set<string>([this.A]);',
        '  static count(): number {',
        '    return this.SCHEME_SET.size;',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'i'], {
      cwd: root,
    });

    const result = await code(['--write', '--all', '--import-from', './helpers']);
    expect(result).toBe(0);
    expect(read('src/phases.ts')).toContain('export class Phases extends ConstClass {');
    expect(read('src/phases.ts')).toContain('static isOpen(value: string): boolean {');
    expect(read('src/phases.ts')).toContain('export class Reads {');
  });

  test('a caller of a class that already extends ConstClass is rewritten, with the class outside the run', async () => {
    write(
      'src/lib.ts',
      "export class ConstClass {}\nexport class Modes extends ConstClass {\n  static readonly READ = 'read';\n}\nexport class Wider extends Modes {\n  static readonly WRITE = 'write';\n}\n",
    );
    write(
      'src/use.ts',
      "import { Modes, Wider } from './lib';\ndeclare const input: string;\nexport const ok = Modes.SCHEME_SET.has(input);\nexport const wide = Wider.SCHEME_SET.has(input);\n",
    );

    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'i'], {
      cwd: root,
    });

    const result = await code(['--write', 'src/use.ts']);
    expect(result).toBe(0);
    expect(read('src/use.ts')).toContain('Modes.isValid(input)');
    expect(read('src/use.ts')).toContain('Wider.isValid(input)');
  });

  test('--emit-map writes the proposals, and --map applies the edited names', async () => {
    write('src/a.ts', source);

    const result = await code(['--emit-map', 'names.json']);
    expect(result).toBe(0);
    const emitted = JSON.parse(read('names.json'));
    expect(emitted['src/a.ts#TMode']).toEqual({
      class: 'Modes',
      members: { read: 'READ', write: 'WRITE' },
    });

    emitted['src/a.ts#TMode'].class = 'FileModes';
    write('names.json', JSON.stringify(emitted));
    const result2 = await code(['--write', '--all', '--map', 'names.json']);
    expect(result2).toBe(0);
    expect(read('src/a.ts')).toContain('export class FileModes extends ConstClass {');
  });

  test('a mapping file that cannot be read exits 2 and writes nothing', async () => {
    write('src/a.ts', source);
    write('bad.json', '[1, 2]');

    const result = await code(['--write', '--all', '--map', 'bad.json']);
    expect(result).toBe(2);
    const result2 = await code(['--write', '--all', '--map', 'missing.json']);
    expect(result2).toBe(2);
    expect(errors.join('\n')).toContain('cannot read the mapping file');
    expect(read('src/a.ts')).toBe(source);
  });

  test('--help exits 0; an unknown flag, --write with --check and a flag without its value exit 2', async () => {
    write('src/a.ts', source);

    const result = await code(['--help']);
    expect(result).toBe(0);
    expect(logs.join('\n')).toContain('Usage: devz codemod const-classes');
    const result2 = await code(['--halp', '--write']);
    expect(result2).toBe(2);
    const result3 = await code(['--write', '--check']);
    expect(result3).toBe(2);
    const result4 = await code(['--map']);
    expect(result4).toBe(2);
    expect(read('src/a.ts')).toBe(source);
  });

  test('test files are skipped unless --include-tests is given, and ignored folders are never read', async () => {
    write('src/__tests__/a.test.ts', source);
    const result = await code(['--check']);
    expect(result).toBe(0);
    const result2 = await code(['--check', '--include-tests']);
    expect(result2).toBe(1);

    mkdirSync(join(root, 'src/generated'));
    write('.gitignore', 'src/generated/\n');
    write('src/generated/b.ts', "export type TOther = 'a' | 'b';\n");
    rmSync(join(root, 'src/__tests__/a.test.ts'));
    const result3 = await code(['--check']);
    expect(result3).toBe(0);
  });

  test('devz codemod dispatches to it, and --help lists all three codemods', async () => {
    write('src/a.ts', source);

    const result = await CodemodCommand.run({ root, args: ['const-classes', '--check'] });
    expect(result).toBe(1);
    logs.length = 0;
    const result2 = await CodemodCommand.run({ root, args: ['--help'] });
    expect(result2).toBe(0);
    expect(logs.join('\n')).toContain('devz codemod drop-redundant-casts');
    expect(logs.join('\n')).toContain('devz codemod const-classes');
  });
});

/** Every class and the exact text of the decorators written on it. */
const decoratorsByClass = (source: string): Record<string, string[]> => {
  const sourceFile = ts.createSourceFile('a.ts', source, ts.ScriptTarget.Latest, true);
  const byClass: Record<string, string[]> = {};

  for (const statement of sourceFile.statements) {
    if (ts.isClassDeclaration(statement) && statement.name) {
      byClass[statement.name.text] = (ts.getDecorators(statement) ?? []).map((decorator) =>
        decorator.getText(sourceFile),
      );
    }
  }

  return byClass;
};

describe('ConstClasses.convert - a decorated class keeps its decorators', () => {
  // A new top-level declaration goes before the anchor's own comment, never between a decorator and
  // the class it decorates: that would hand `@service()` to the new const class, and the service
  // would no longer be registered.
  const SERVICE =
    "@service()\nexport class InvoiceService {}\n\nexport type TMode = 'draft' | 'final';\n";
  const CONTROLLER = [
    '/** The invoice controller. */',
    '@controller({',
    "  path: '/invoices',",
    "  tags: ['billing'],",
    '})',
    '@authenticate()',
    "@authorize({ action: 'read' })",
    'export class InvoiceController {}',
    '',
    '/** How an invoice is billed. */',
    "export type TBilling = 'once' | 'monthly';",
    '',
  ].join('\n');

  test.each([
    ['one @service()', SERVICE],
    ['a multi-line @controller({ ... }), stacked decorators and a JSDoc above them', CONTROLLER],
    [
      'the decorated class right below the union, with no blank line',
      "export type TMode = 'draft' | 'final';\n@service()\nexport class InvoiceService {}\n",
    ],
    [
      'an interface member below the decorated class',
      "@service()\nexport class InvoiceService {}\n\nexport interface IOptions {\n  mode: 'draft' | 'final';\n}\n",
    ],
  ])('%s', (_name, source) => {
    const result = convert(source);

    expect(result.proposals).toHaveLength(1);
    expect(decoratorsByClass(result.output)).toEqual(
      expect.objectContaining(decoratorsByClass(source)),
    );
    // The decorated class is still the first statement that follows its decorators.
    const decorated = Object.entries(decoratorsByClass(source)).filter(([, d]) => d.length > 0);

    for (const [className] of decorated) {
      expect(result.output).toMatch(new RegExp(`\\)\\s*\\n\\s*export class ${className} \\{`));
    }
  });

  test('the const class lands before the JSDoc of the alias, after the decorated class above it', () => {
    const result = convert(CONTROLLER);

    const controller = result.output.indexOf('export class InvoiceController');
    const generated = result.output.indexOf('export class Billings');
    const aliasDoc = result.output.indexOf('/** How an invoice is billed. */');

    expect(controller).toBeGreaterThan(-1);
    expect(generated).toBeGreaterThan(controller);
    expect(aliasDoc).toBeGreaterThan(generated);
  });

  test('the check sees the bug it guards against: a class inserted between a decorator and its class', () => {
    const correct =
      '@service()\nexport class InvoiceService {}\n\nexport class Modes extends ConstClass {}\n';
    const broken =
      '@service()\nexport class Modes extends ConstClass {}\n\nexport class InvoiceService {}\n';

    expect(decoratorsByClass(broken)).not.toEqual(decoratorsByClass(correct));
    expect(decoratorsByClass(correct)).toEqual({ InvoiceService: ['@service()'], Modes: [] });
  });

  test('a union inside a decorated class is reported and the class is left byte for byte', () => {
    const source = [
      '@service()',
      'export class ReportService extends ConstClass {',
      "  plan: 'monthly' | 'yearly' = 'monthly';",
      '',
      "  render(format: 'pdf' | 'html'): string {",
      '    return format;',
      '  }',
      '}',
      '',
    ].join('\n');

    const result = convert(source);

    expect(result.output).toBe(source);
    expect(result.proposals).toHaveLength(0);
    expect(result.untouched).toHaveLength(2);
  });
});
