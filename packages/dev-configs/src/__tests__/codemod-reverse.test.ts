import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { ConnectorImports } from '../cli/codemod/connector-imports';
import {
  ALL_MAPPINGS,
  type INamespaceMapping,
  NamespaceFunctions,
  NamespaceFunctionsCommand,
  NamespaceFunctionsReverse,
} from '../cli/codemod/namespace-functions';

const FLOAT: INamespaceMapping = {
  modules: ['@venizia/ignis-helpers', '@venizia/ignis'],
  oldName: 'float',
  className: 'ParseUtility',
  method: 'toFloat',
  params: [{ key: 'input' }, { key: 'digit', optional: true }],
};

const JOIN_SEGMENTS: INamespaceMapping = {
  modules: ['@venizia/ignis-helpers'],
  oldName: 'joinSegments',
  className: 'SegmentUtility',
  method: 'join',
  params: [{ key: 'base' }],
  restKey: 'segments',
};

const TO_INT: INamespaceMapping = {
  modules: ['@venizia/ignis-helpers/core'],
  oldName: 'toInt',
  className: 'ParseUtility',
  method: 'toInt',
  newModules: ['@venizia/ignis-helpers'],
  params: [{ key: 'input' }],
};

const IS_EMPTY: INamespaceMapping = {
  modules: ['@venizia/ignis-helpers'],
  oldName: 'isEmptyValue',
  className: 'ObjectUtility',
  method: 'isEmpty',
  params: [],
  keepsOptions: true,
};

const MAPPINGS = [FLOAT, JOIN_SEGMENTS, TO_INT, IS_EMPTY];

const lines = (...rows: string[]) => `${rows.join('\n')}\n`;

const forward = (source: string) =>
  NamespaceFunctions.rewrite({ typescript: ts, fileName: 'a.ts', source, mappings: MAPPINGS });

const reverse = (source: string) =>
  NamespaceFunctionsReverse.rewrite({
    typescript: ts,
    fileName: 'a.ts',
    source,
    mappings: MAPPINGS,
  });

describe('namespace-functions --reverse: the round trip', () => {
  const fixtures: Record<string, string> = {
    'positional with an optional': lines(
      "import { float } from '@venizia/ignis-helpers';",
      '',
      'export const price = float(value, 3);',
      'export const plain = float(input);',
    ),
    'a rest parameter': lines(
      "import { joinSegments } from '@venizia/ignis-helpers';",
      '',
      "export const path = joinSegments('a', 'b', 'c');",
      "export const bare = joinSegments('a');",
    ),
    'a class imported from another module': lines(
      "import { toInt } from '@venizia/ignis-helpers/core';",
      'export const n = toInt(raw);',
    ),
    'a call that keeps its options': lines(
      "import { isEmptyValue } from '@venizia/ignis-helpers';",
      'export const empty = isEmptyValue({ value });',
    ),
    'nested calls and several names in one import': lines(
      "import { float, joinSegments, other } from '@venizia/ignis-helpers';",
      '',
      "export const a = joinSegments(String(float(x, float(y))), 'z');",
      'other();',
    ),
  };

  for (const [name, original] of Object.entries(fixtures)) {
    test(`${name}: forward then reverse gives the original file`, () => {
      const moved = forward(original);

      expect(moved.changed).toBe(true);

      const back = reverse(moved.output);

      expect(back.output).toBe(original);
      expect(back.reports).toEqual([]);
    });
  }

  test('the shipped table: every entry goes forward and back', () => {
    for (const mapping of ALL_MAPPINGS) {
      const module = mapping.modules[0] ?? '';
      const params = mapping.keepsOptions
        ? ['{ value }']
        : [...mapping.params.map((parameter) => parameter.key)];
      const rest = mapping.restKey ? ["'x'"] : [];
      const original = lines(
        `import { ${mapping.oldName} } from '${module}';`,
        `export const result = ${mapping.oldName}(${[...params, ...rest].join(', ')});`,
      );
      const moved = NamespaceFunctions.rewrite({
        typescript: ts,
        fileName: 'a.ts',
        source: original,
        mappings: ALL_MAPPINGS,
      });
      const back = NamespaceFunctionsReverse.rewrite({
        typescript: ts,
        fileName: 'a.ts',
        source: moved.output,
        mappings: ALL_MAPPINGS,
      });

      expect(back.output).toBe(original);
    }
  });
});

describe('namespace-functions --reverse: what it reads and what it leaves', () => {
  test('a class still used for another method keeps its import, and the old name is added', () => {
    const result = reverse(
      lines(
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        'export const a = ParseUtility.toFloat({ input: x });',
        'export const b = ParseUtility.other(1);',
      ),
    );

    expect(result.output).toBe(
      lines(
        "import { ParseUtility, float } from '@venizia/ignis-helpers';",
        'export const a = float(x);',
        'export const b = ParseUtility.other(1);',
      ),
    );
  });

  test('a skipped optional parameter before a given one becomes undefined', () => {
    const mapping: INamespaceMapping = {
      ...FLOAT,
      params: [
        { key: 'input', optional: true },
        { key: 'digit', optional: true },
      ],
    };
    const result = NamespaceFunctionsReverse.rewrite({
      typescript: ts,
      fileName: 'a.ts',
      source: lines(
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        'export const a = ParseUtility.toFloat({ digit: 2 });',
        'export const b = ParseUtility.toFloat({});',
      ),
      mappings: [mapping],
    });

    expect(result.output).toContain('float(undefined, 2)');
    expect(result.output).toContain('float()');
  });

  test('a spread, an unknown key and a missing required key stay, with a report each', () => {
    const source = lines(
      "import { ParseUtility } from '@venizia/ignis-helpers';",
      'export const a = ParseUtility.toFloat({ ...opts });',
      'export const b = ParseUtility.toFloat({ input: x, extra: 1 });',
      'export const c = ParseUtility.toFloat({ digit: 1 });',
      'export const d = ParseUtility.toFloat(opts);',
    );
    const result = reverse(source);

    expect(result.output).toBe(source);
    expect(result.rewritten).toBe(0);
    expect(result.reports.length).toBe(4);
  });

  test('a class that did not come from a module of the table is not touched', () => {
    const source = lines(
      "import { ParseUtility } from 'my-own-package';",
      'export const a = ParseUtility.toFloat({ input: x });',
    );

    expect(reverse(source).output).toBe(source);
  });

  test('a file that declares the old name already is reported, and its import is not added', () => {
    const result = reverse(
      lines(
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        'const float = 1;',
        'export const a = ParseUtility.toFloat({ input: float });',
      ),
    );

    expect(result.reports.some((report) => report.reason.includes('already declared'))).toBe(true);
  });

  test('a file with no import of the class gets a new import of the old name', () => {
    const result = reverse(
      lines(
        "import { ParseUtility } from 'elsewhere';",
        "import { ParseUtility as P } from '@venizia/ignis-helpers';",
        'export const a = P.toFloat({ input: x });',
      ),
    );

    expect(result.output).toContain('float(x)');
    expect(result.output).toContain("import { float } from '@venizia/ignis-helpers';");
  });
});

describe('connector-imports --reverse', () => {
  test('forward then reverse gives the original file', () => {
    const original = [
      `import { A } from '@venizia/ignis/postgres';`,
      `export * from '@venizia/ignis/search';`,
      `const B = await import('@venizia/ignis/sqlite/libsql');`,
      '',
    ].join('\n');
    const moved = ConnectorImports.rewrite({ typescript: ts, fileName: 'a.ts', source: original });
    const back = ConnectorImports.rewrite({
      typescript: ts,
      fileName: 'a.ts',
      source: moved.output,
      reverse: true,
    });

    expect(moved.output).toContain('@venizia/ignis-connectors/postgres');
    expect(back.output).toBe(original);
  });

  test('a connectors sub-path that was never a sub-path of @venizia/ignis is left alone', () => {
    const source = `import { X } from '@venizia/ignis-connectors/other';\n`;

    expect(
      ConnectorImports.rewrite({ typescript: ts, fileName: 'a.ts', source, reverse: true }).output,
    ).toBe(source);
  });
});

describe('devz codemod --list and --reverse', () => {
  let root: string;
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'codemod-reverse-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'src'), { recursive: true });
    logs = [];
    errors = [];
    spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    spyOn(console, 'warn').mockImplementation(() => {});
    spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('--list prints one name per line and nothing else', async () => {
    const code = await CodemodCommand.run({ root, args: ['--list'] });

    expect(code).toBe(0);
    expect(logs).toEqual([
      [
        'drop-redundant-casts',
        'const-classes',
        'async-style',
        'namespace-functions',
        'connector-imports',
      ].join('\n'),
    ]);
    expect(errors).toEqual([]);
  });

  for (const name of ['drop-redundant-casts', 'const-classes', 'async-style']) {
    test(`${name} --reverse exits 2 and says not reversible`, async () => {
      const code = await CodemodCommand.run({ root, args: [name, '--reverse'] });

      expect(code).toBe(2);
      expect(errors.join('\n')).toContain('not reversible');
    });
  }

  test('connector-imports --reverse --write moves the files back, a dry run writes nothing', async () => {
    const file = join(root, 'src', 'a.ts');
    const moved = `import { A } from '@venizia/ignis-connectors/postgres';\n`;
    writeFileSync(file, moved);
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'x'],
      { cwd: root },
    );

    const dryCode = await CodemodCommand.run({ root, args: ['connector-imports', '--reverse'] });

    expect(dryCode).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(moved);

    const writeCode = await CodemodCommand.run({
      root,
      args: ['connector-imports', '--reverse', '--write'],
    });

    expect(writeCode).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(`import { A } from '@venizia/ignis/postgres';\n`);
  });

  test('namespace-functions --reverse --write turns a call back into the old function', async () => {
    const mappings = [FLOAT];
    const file = join(root, 'src', 'a.ts');
    writeFileSync(
      file,
      lines(
        "import { ParseUtility } from '@venizia/ignis-helpers';",
        'export const a = ParseUtility.toFloat({ input: x, digit: 3 });',
      ),
    );
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'x'],
      { cwd: root },
    );

    const code = await NamespaceFunctionsCommand.run({
      root,
      args: ['--reverse', '--write'],
      mappings,
    });

    expect(code).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(
      lines("import { float } from '@venizia/ignis-helpers';", 'export const a = float(x, 3);'),
    );
  });
});
