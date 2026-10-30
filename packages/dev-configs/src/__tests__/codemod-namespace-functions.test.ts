import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import {
  ALL_MAPPINGS,
  type INamespaceMapping,
  NamespaceFunctions,
  NamespaceFunctionsCommand,
  NamespaceMappings,
} from '../cli/codemod/namespace-functions';
import { BOOT_MAPPINGS } from '../cli/codemod/namespace-functions/mappings/boot';
import { CONNECTORS_MAPPINGS } from '../cli/codemod/namespace-functions/mappings/connectors';
import { CORE_SERVER_MAPPINGS } from '../cli/codemod/namespace-functions/mappings/core-server';
import { CORE_WORKER_MAPPINGS } from '../cli/codemod/namespace-functions/mappings/core-worker';
import { DEV_CONFIGS_MAPPINGS } from '../cli/codemod/namespace-functions/mappings/dev-configs';
import { FILTER_MAPPINGS } from '../cli/codemod/namespace-functions/mappings/filter';
import { HELPERS_MAPPINGS } from '../cli/codemod/namespace-functions/mappings/helpers';
import { INVERSION_MAPPINGS } from '../cli/codemod/namespace-functions/mappings/inversion';
import { KERNEL_MAPPINGS } from '../cli/codemod/namespace-functions/mappings/kernel';
import { findRepositoryRoot, REPO_TMP_DIRECTORY } from '../testing/repo-tmp';
import { spawnSyncBounded } from '../testing/spawn.helper';

/**
 * The example entry, a fixture: `float(input, digit = 2)` of `@venizia/ignis-helpers` as
 * `ParseUtility.toFloat({ input, digit })`. It is not in the shipped table, because the class does
 * not exist yet.
 */
const FLOAT: INamespaceMapping = {
  modules: ['@venizia/ignis-helpers', '@venizia/ignis'],
  oldName: 'float',
  className: 'ParseUtility',
  method: 'toFloat',
  params: [{ key: 'input' }, { key: 'digit', optional: true }],
};

/** A made-up function with a rest parameter. */
const JOIN_SEGMENTS: INamespaceMapping = {
  modules: ['@venizia/ignis-helpers'],
  oldName: 'joinSegments',
  className: 'SegmentUtility',
  method: 'join',
  params: [{ key: 'base' }],
  restKey: 'segments',
};

/** A made-up function whose class is imported from another module than the old name. */
const TO_INT: INamespaceMapping = {
  modules: ['@venizia/ignis-helpers/core'],
  oldName: 'toInt',
  className: 'ParseUtility',
  method: 'toInt',
  newModules: ['@venizia/ignis-helpers'],
  params: [{ key: 'input' }],
};

const MAPPINGS = [FLOAT, JOIN_SEGMENTS, TO_INT];

const rewrite = (source: string, fileName = 'a.ts') =>
  NamespaceFunctions.rewrite({ typescript: ts, fileName, source, mappings: MAPPINGS });

const lines = (...rows: string[]) => `${rows.join('\n')}\n`;

describe('NamespaceFunctions.rewrite - the calls', () => {
  test('a named import: the call takes one options object, the import takes the class', () => {
    const result = rewrite(
      lines(
        "import { float } from '@venizia/ignis-helpers';",
        '',
        'export const price = float(value, 3);',
      ),
    );

    expect(result.output).toBe(
      lines(
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        '',
        'export const price = ParseUtility.toFloat({ input: value, digit: 3 });',
      ),
    );
    expect(result.rewritten).toBe(1);
    expect(result.reports).toEqual([]);
  });

  test('an argument named like its key is written short', () => {
    const result = rewrite(
      lines(
        "import { float } from '@venizia/ignis-helpers';",
        'export const a = float(input, digit);',
      ),
    );

    expect(result.output).toContain('ParseUtility.toFloat({ input, digit })');
  });

  test('an aliased import: the alias is followed, and the class comes from the same module', () => {
    const result = rewrite(
      lines("import { float as toNumber } from '@venizia/ignis';", 'export const a = toNumber(x);'),
    );

    expect(result.output).toBe(
      lines(
        "import { ParseUtility } from '@venizia/ignis';",
        'export const a = ParseUtility.toFloat({ input: x });',
      ),
    );
  });

  test('a namespace import: the call goes through the namespace, and the import stays', () => {
    const result = rewrite(
      lines(
        "import * as helpers from '@venizia/ignis-helpers';",
        'export const a = helpers.float(x, 1);',
        'export const b = helpers.other(x);',
      ),
    );

    expect(result.output).toBe(
      lines(
        "import * as helpers from '@venizia/ignis-helpers';",
        'export const a = helpers.ParseUtility.toFloat({ input: x, digit: 1 });',
        'export const b = helpers.other(x);',
      ),
    );
  });

  test('an optional parameter the call leaves out is left out of the object', () => {
    const result = rewrite(
      lines("import { float } from '@venizia/ignis-helpers';", 'export const a = float(raw);'),
    );

    expect(result.output).toContain('ParseUtility.toFloat({ input: raw })');
    expect(result.output).not.toContain('digit');
  });

  test('several calls in one file, a nested call and an optional call', () => {
    const result = rewrite(
      lines(
        "import { float } from '@venizia/ignis-helpers';",
        'export const a = float(x);',
        'export const b = float(float(y), 2);',
        'export const c = float?.(z, 4);',
      ),
    );

    expect(result.output).toBe(
      lines(
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        'export const a = ParseUtility.toFloat({ input: x });',
        'export const b = ParseUtility.toFloat({ input: ParseUtility.toFloat({ input: y }), digit: 2 });',
        'export const c = ParseUtility.toFloat({ input: z, digit: 4 });',
      ),
    );
    expect(result.rewritten).toBe(4);
  });

  test('the argument text, its comments and the code around it stay as they are', () => {
    const result = rewrite(
      lines(
        "import { float } from '@venizia/ignis-helpers';",
        '// the price, rounded',
        'export const a = float(order.total /* raw */, 2); // keep',
        'export const b = float(',
        '  compute({ a: 1 }),',
        '  2,',
        ');',
      ),
    );

    expect(result.output).toBe(
      lines(
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        '// the price, rounded',
        'export const a = ParseUtility.toFloat({ input: order.total /* raw */, digit: 2 }); // keep',
        'export const b = ParseUtility.toFloat(',
        '  { input: compute({ a: 1 }),',
        '  digit: 2 },',
        ');',
      ),
    );
  });

  test('a rest parameter goes under its key as one array, an empty one when the call passes none', () => {
    const result = rewrite(
      lines(
        "import { joinSegments } from '@venizia/ignis-helpers';",
        "export const a = joinSegments(base, 'x', 'y');",
        'export const b = joinSegments(base);',
      ),
    );

    expect(result.output).toContain("SegmentUtility.join({ base, segments: ['x', 'y'] })");
    expect(result.output).toContain('SegmentUtility.join({ base, segments: [] })');
  });

  test('a TSX file', () => {
    const result = rewrite(
      lines(
        "import { float } from '@venizia/ignis-helpers';",
        'export const Price = () => <span title={String(float(x))}>{float(y, 1)}</span>;',
      ),
      'price.tsx',
    );

    expect(result.output).toBe(
      lines(
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        'export const Price = () => <span title={String(ParseUtility.toFloat({ input: x }))}>{ParseUtility.toFloat({ input: y, digit: 1 })}</span>;',
      ),
    );
  });

  test('running it twice changes nothing the second time', () => {
    const first = rewrite(
      lines(
        "import { float, getError } from '@venizia/ignis-helpers';",
        'export const a = float(x, 3);',
        'export const all = values.map(float);',
      ),
    );
    const second = rewrite(first.output);

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.rewritten).toBe(0);
    expect(second.output).toBe(first.output);
  });
});

describe('NamespaceFunctions.rewrite - the imports', () => {
  test('a class already imported is reused, and the old name goes', () => {
    const result = rewrite(
      lines(
        "import { ParseUtility, float, getError } from '@venizia/ignis-helpers';",
        'export const a = float(x);',
      ),
    );

    expect(result.output).toBe(
      lines(
        "import { ParseUtility, getError } from '@venizia/ignis-helpers';",
        'export const a = ParseUtility.toFloat({ input: x });',
      ),
    );
  });

  test('a class imported under an alias is called by the alias', () => {
    const result = rewrite(
      lines(
        "import { ParseUtility as Parse } from '@venizia/ignis-helpers';",
        "import { float } from '@venizia/ignis-helpers';",
        'export const a = float(x);',
      ),
    );

    expect(result.output).toBe(
      lines(
        "import { ParseUtility as Parse } from '@venizia/ignis-helpers';",
        'export const a = Parse.toFloat({ input: x });',
      ),
    );
  });

  test('the class takes the place of the old name; other names and a multi-line layout stay', () => {
    const result = rewrite(
      lines(
        'import {',
        '  getError,',
        '  float,',
        '  type IThing,',
        "} from '@venizia/ignis-helpers';",
        'export const a = float(x);',
      ),
    );

    expect(result.output).toBe(
      lines(
        'import {',
        '  getError,',
        '  ParseUtility,',
        '  type IThing,',
        "} from '@venizia/ignis-helpers';",
        'export const a = ParseUtility.toFloat({ input: x });',
      ),
    );
  });

  test('an import type is never touched', () => {
    const result = rewrite(
      lines(
        "import type { IThing } from '@venizia/ignis-helpers';",
        "import { float } from '@venizia/ignis-helpers';",
        'export const a = float(x);',
      ),
    );

    expect(result.output).toBe(
      lines(
        "import type { IThing } from '@venizia/ignis-helpers';",
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        'export const a = ParseUtility.toFloat({ input: x });',
      ),
    );
  });

  test('newModules: the class is imported from its own module, and an import left empty goes', () => {
    const result = rewrite(
      lines("import { toInt } from '@venizia/ignis-helpers/core';", 'export const a = toInt(x);'),
    );

    expect(result.output).toBe(
      lines(
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        'export const a = ParseUtility.toInt({ input: x });',
      ),
    );
  });

  test('two old names that move into one class import it once', () => {
    const result = rewrite(
      lines(
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        "import { toInt } from '@venizia/ignis-helpers/core';",
        "import { float } from '@venizia/ignis-helpers';",
        'export const a = toInt(float(x));',
      ),
    );

    expect(result.output).toBe(
      lines(
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        'export const a = ParseUtility.toInt({ input: ParseUtility.toFloat({ input: x }) });',
      ),
    );
  });
});

describe('NamespaceFunctions.rewrite - what it reports and leaves', () => {
  test('the old name used as a value is reported with its line, and keeps its import', () => {
    const result = rewrite(
      lines(
        "import { float } from '@venizia/ignis-helpers';",
        'export const one = float(x);',
        'export const all = values.map(float);',
        'export type TParse = typeof float;',
      ),
    );

    expect(result.output).toBe(
      lines(
        "import { float, ParseUtility } from '@venizia/ignis-helpers';",
        'export const one = ParseUtility.toFloat({ input: x });',
        'export const all = values.map(float);',
        'export type TParse = typeof float;',
      ),
    );
    expect(result.reports.map((report) => [report.line, report.column])).toEqual([
      [3, 31],
      [4, 29],
    ]);
    expect(result.reports[0]?.reason).toContain('`float` is used as a value');
  });

  test.each([
    ['a spread argument', 'float(...args)', 'has a spread argument'],
    ['too few arguments', 'float()', 'fewer than the 1 it needs'],
    ['too many arguments', 'float(a, 2, 3)', 'more than its 2 parameter(s)'],
  ])('%s: reported, and the file is left as it is', (_label, call, reason) => {
    const source = lines(
      "import { float } from '@venizia/ignis-helpers';",
      `export const a = ${call};`,
    );
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]).toMatchObject({ line: 2, column: 18 });
    expect(result.reports[0]?.reason).toContain(reason);
    expect(result.reports[0]?.reason).toContain('ParseUtility.toFloat({ input, digit })');
  });

  test('a call left for a person keeps the import of the old name next to the class', () => {
    const result = rewrite(
      lines(
        "import { float } from '@venizia/ignis-helpers';",
        'export const a = float(x);',
        'export const b = float(...args);',
      ),
    );

    expect(result.output).toContain(
      "import { float, ParseUtility } from '@venizia/ignis-helpers';",
    );
    expect(result.output).toContain('export const b = float(...args);');
    expect(result.reports).toHaveLength(1);
  });

  test('the same name imported from another module is not touched', () => {
    const source = lines(
      "import { float } from './numbers';",
      "import { float as other } from 'lodash-like';",
      'export const a = float(x, 3) + other(y);',
    );
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.reports).toEqual([]);
  });

  test('a local binding that shadows the old name is reported, and nothing is rewritten', () => {
    const source = lines(
      "import { float } from '@venizia/ignis-helpers';",
      'export const a = float(x);',
      'export const b = (float: (value: number) => number) => float(1);',
    );
    const result = rewrite(source);

    expect(result.output).toBe(source);
    expect(result.reports[0]).toMatchObject({ line: 3 });
    expect(result.reports[0]?.reason).toContain('`float` is declared again');
  });

  test.each([
    ['a local class', 'class ParseUtility {}'],
    ['an import from another module', "import { ParseUtility } from './mine';"],
    ['a type-only import', "import type { ParseUtility } from '@venizia/ignis-helpers';"],
  ])(
    'the class name already declared by %s is reported, and nothing is rewritten',
    (_label, line) => {
      const source = lines(
        line,
        "import { float } from '@venizia/ignis-helpers';",
        'export const a = float(x);',
      );
      const result = rewrite(source);

      expect(result.output).toBe(source);
      expect(result.reports).toHaveLength(1);
      expect(result.reports[0]?.reason).toContain('the name `ParseUtility` is already declared');
    },
  );

  test('a re-export and a type-only import of the old name are reported', () => {
    const source = lines(
      "export { float } from '@venizia/ignis-helpers';",
      "import type { float as TFloat } from '@venizia/ignis-helpers';",
    );
    const result = rewrite(source);

    expect(result.output).toBe(source);
    expect(result.reports.map((report) => report.line)).toEqual([1, 2]);
    expect(result.reports[0]?.reason).toContain('re-exports `float`');
    expect(result.reports[1]?.reason).toContain('imported as a type only');
  });

  test('a local export of the old name counts as a use, so its import stays', () => {
    const result = rewrite(
      lines(
        "import { float } from '@venizia/ignis-helpers';",
        'export const a = float(x);',
        'export { float };',
      ),
    );

    expect(result.output).toContain(
      "import { float, ParseUtility } from '@venizia/ignis-helpers';",
    );
    expect(result.reports[0]).toMatchObject({ line: 3 });
  });
});

describe('NamespaceMappings - the table', () => {
  test('the shipped table is valid, and has one file per package', () => {
    const files = [
      DEV_CONFIGS_MAPPINGS,
      INVERSION_MAPPINGS,
      FILTER_MAPPINGS,
      HELPERS_MAPPINGS,
      BOOT_MAPPINGS,
      KERNEL_MAPPINGS,
      CONNECTORS_MAPPINGS,
      CORE_WORKER_MAPPINGS,
      CORE_SERVER_MAPPINGS,
    ];

    expect(files.every((file) => Array.isArray(file))).toBe(true);
    expect(ALL_MAPPINGS).toEqual(files.flat());
    expect(NamespaceMappings.validate({ mappings: ALL_MAPPINGS })).toEqual([]);
  });

  test('the fixtures are valid, and a broken entry is caught', () => {
    expect(NamespaceMappings.validate({ mappings: MAPPINGS })).toEqual([]);

    const problems = NamespaceMappings.validate({
      mappings: [
        FLOAT,
        FLOAT,
        {
          modules: [],
          oldName: 'bad-name',
          className: 'X',
          method: 'y',
          params: [{ key: 'a', optional: true }, { key: 'b' }, { key: 'b' }],
          restKey: 'a',
        },
      ],
    });

    expect(problems.join('\n')).toContain('float from @venizia/ignis-helpers has two entries');
    expect(problems.join('\n')).toContain('oldName "bad-name" is not an identifier');
    expect(problems.join('\n')).toContain('modules must list at least one');
    expect(problems.join('\n')).toContain('the required parameter "b" follows an optional one');
    expect(problems.join('\n')).toContain('the parameter key "b" is listed twice');
    expect(problems.join('\n')).toContain('restKey "a" is also a parameter key');
  });
});

/** A private folder under the repository's test temp folder, never the system temp. */
const makeScratch = (prefix: string) => {
  const scratch = join(findRepositoryRoot(), REPO_TMP_DIRECTORY);
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, prefix));
  execFileSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(join(root, 'src'), { recursive: true });
  return root;
};

const commitAll = (root: string) => {
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync(
    'git',
    ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'fixture'],
    { cwd: root },
  );
};

describe('devz codemod namespace-functions - the command', () => {
  let root: string;
  let logs: string[];
  let warnings: string[];
  let errors: string[];

  beforeEach(() => {
    root = makeScratch('namespace-');
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
  const code = (args: string[], mappings: ReadonlyArray<INamespaceMapping> = MAPPINGS) =>
    NamespaceFunctionsCommand.run({ root, args, mappings });
  const SOURCE = lines(
    "import { float } from '@venizia/ignis-helpers';",
    'export const a = float(x, 3);',
  );
  const REWRITTEN = lines(
    "import { ParseUtility } from '@venizia/ignis-helpers';",
    'export const a = ParseUtility.toFloat({ input: x, digit: 3 });',
  );

  test('without --write it lists what would change, writes nothing and exits 0', async () => {
    write('src/a.ts', SOURCE);

    const result = await code([]);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toBe(SOURCE);
    expect(logs).toContain('would change  src/a.ts  (1 call(s))');
    expect(logs.join('\n')).toContain(
      'devz codemod namespace-functions: 1 file(s) would change, 1 call(s) would be rewritten, 0 left untouched',
    );
    expect(logs.join('\n')).toContain('Nothing was written');
  });

  test('--write rewrites the file, and a second run finds nothing', async () => {
    write('src/a.ts', SOURCE);
    commitAll(root);

    const result = await code(['--write']);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toBe(REWRITTEN);
    expect(logs).toContain('changed  src/a.ts  (1 call(s))');

    commitAll(root);
    logs.length = 0;
    const result2 = await code(['--write']);
    expect(result2).toBe(0);
    expect(read('src/a.ts')).toBe(REWRITTEN);
    expect(logs.join('\n')).toContain('0 file(s) changed, 0 call(s) rewritten, 0 left untouched');
  });

  test('--check exits 1 while a call can be rewritten or is left untouched, and 0 when neither', async () => {
    write('src/a.ts', SOURCE);
    const result = await code(['--check']);
    expect(result).toBe(1);
    expect(read('src/a.ts')).toBe(SOURCE);

    write(
      'src/a.ts',
      lines("import { float } from '@venizia/ignis-helpers';", 'export const a = float(...xs);'),
    );
    const result2 = await code(['--check']);
    expect(result2).toBe(1);
    expect(warnings.join('\n')).toContain(
      'src/a.ts:2:18  this call of `float` has a spread argument',
    );

    write('src/a.ts', REWRITTEN);
    const result3 = await code(['--check']);
    expect(result3).toBe(0);
  });

  test('--write refuses a file with local changes and exits 1', async () => {
    write('src/a.ts', SOURCE);

    const result = await code(['--write']);
    expect(result).toBe(1);
    expect(read('src/a.ts')).toBe(SOURCE);
    expect(warnings.join('\n')).toContain('refused  src/a.ts  has local changes');
  });

  test('--help exits 0; an unknown flag and --write with --check exit 2', async () => {
    write('src/a.ts', SOURCE);

    const result = await code(['--help']);
    expect(result).toBe(0);
    expect(logs.join('\n')).toContain('Usage: devz codemod namespace-functions');
    const result2 = await code(['--halp']);
    expect(result2).toBe(2);
    const result3 = await code(['--write', '--check']);
    expect(result3).toBe(2);
    expect(read('src/a.ts')).toBe(SOURCE);
  });

  test('a broken table exits 1 before reading a file; an empty one exits 0 with a note', async () => {
    write('src/a.ts', SOURCE);

    const result = await code(['--write'], [{ ...FLOAT, params: [{ key: 'not a key' }] }]);
    expect(result).toBe(1);
    expect(errors.join('\n')).toContain('the mapping table is broken');
    expect(read('src/a.ts')).toBe(SOURCE);

    const result2 = await code(['--check'], []);
    expect(result2).toBe(0);
    expect(logs.join('\n')).toContain('the mapping table of this version is empty');
  });

  test('devz codemod dispatches to it, and --help lists it', async () => {
    write('src/a.ts', SOURCE);

    const result = await CodemodCommand.run({ root, args: ['namespace-functions', '--help'] });
    expect(result).toBe(0);
    logs.length = 0;
    const result2 = await CodemodCommand.run({ root, args: ['--help'] });
    expect(result2).toBe(0);
    expect(logs.join('\n')).toContain('devz codemod namespace-functions');
  });
});

describe('devz codemod namespace-functions - the CLI end to end', () => {
  const CLI = join(__dirname, '../cli/index.ts');
  let root: string;

  beforeEach(() => {
    root = makeScratch('namespace-cli-');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const devz = (args: string[]) => {
    const result = spawnSyncBounded({ cmd: ['bun', CLI, ...args], cwd: root });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  };

  test('devz lists the codemod, and its --help and a bad flag answer through the real binary', () => {
    expect(devz(['--help']).stdout).toContain('codemod namespace-functions [paths...]');
    expect(devz(['codemod', '--help']).stdout).toContain('Usage: devz codemod namespace-functions');

    const bad = devz(['codemod', 'namespace-functions', '--bogus']);
    expect(bad.exitCode).toBe(2);
    expect(bad.stderr).toContain('unknown option "--bogus"');
  });

  test('a run with the shipped table over a fixture folder writes nothing it has no entry for', () => {
    // getError stays a function (a documented exception), so no table entry will ever move it.
    const source = lines(
      "import { getError } from '@venizia/ignis-helpers';",
      "export const a = getError({ message: 'x' });",
    );
    writeFileSync(join(root, 'src/a.ts'), source);
    commitAll(root);

    const result = devz(['codemod', 'namespace-functions', '--write']);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(root, 'src/a.ts'), 'utf8')).toBe(source);
    expect(result.stdout).toContain(
      ALL_MAPPINGS.length === 0
        ? 'the mapping table of this version is empty'
        : 'devz codemod namespace-functions:',
    );
  });
});
