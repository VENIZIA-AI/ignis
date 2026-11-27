import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import type { IFrameworkApiPattern } from '../linters/house';
import { houseConfigs, houseEslintPlugin, PreferFrameworkApiRule } from '../linters/house';

const NAME = PreferFrameworkApiRule.NAME;
const roots: Array<string> = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A package folder whose manifest has this name and these dependencies. */
const project = (opts: { name?: string; dependencies?: string[] }) => {
  const root = mkdtempSync(join(tmpdir(), 'framework-rows-'));
  const dependencies = Object.fromEntries((opts.dependencies ?? []).map((entry) => [entry, '1']));

  roots.push(root);
  mkdirSync(join(root, 'src'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: opts.name ?? 'app', dependencies }),
  );

  return root;
};

const IGNIS = project({ dependencies: ['@venizia/ignis'] });
const ARDOR = project({ dependencies: ['@venizia/ardor-react'] });
const BARE = project({});

const lint = (
  code: string,
  opts: {
    root?: string;
    entry?: Linter.RuleEntry;
    hooks?: boolean;
    ignore?: string[];
    extra?: IFrameworkApiPattern[];
  } = {},
) => {
  const { root = IGNIS, entry, ...options } = opts;

  return new Linter({ cwd: root })
    .verify(
      code,
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tseslint.parser as Linter.Parser },
          plugins: { '@venizia': houseEslintPlugin },
          rules: { [NAME]: entry ?? PreferFrameworkApiRule.build(options) },
        },
      ],
      { filename: join(root, 'src/subject.ts') },
    )
    .map((message) => message.message);
};

describe('@venizia/prefer-framework-api, rows outside React', () => {
  test('instanceof ApplicationError names isApplicationError', () => {
    expect(lint('const is = error instanceof ApplicationError;')).toEqual([
      "Use `isApplicationError(error)`, not `instanceof ApplicationError`, which fails across two installed copies: `import { isApplicationError } from '@venizia/ignis-helpers/core';`",
    ]);
  });

  test('an APP_ENV_ read of process.env is reported', () => {
    for (const code of [
      'const a = process.env.APP_ENV_PORT;',
      "const a = process.env['APP_ENV_PORT'];",
      'const a = process.env.APP_ENV_PORT ?? 3000;',
    ]) {
      expect(lint(code)).toEqual([
        "Read an `APP_ENV_` name with `applicationEnvironment.get(key)`, not `process.env`: `import { applicationEnvironment } from '@venizia/ignis-helpers';`",
      ]);
    }
  });

  test('a read on the right of an assignment is still reported', () => {
    expect(lint('process.env.APP_ENV_A = process.env.APP_ENV_B;')).toHaveLength(1);
  });

  test('web storage is reported on a member of it', () => {
    for (const code of [
      "localStorage.getItem('a');",
      "window.localStorage.setItem('a', 'b');",
      "const a = sessionStorage['a'];",
      "globalThis.sessionStorage.removeItem('a');",
    ]) {
      expect(lint(code, { root: ARDOR })).toEqual([
        "Use `BrowserStorage` (or the `useStoredState` hook), not `localStorage` / `sessionStorage`: it never throws: `import { BrowserStorage } from '@venizia/ardor-kernel';`",
      ]);
    }
  });

  test('a localhost URL used as a fallback is reported', () => {
    for (const code of [
      "const a = url ?? 'http://localhost:3000/x';",
      "const a = url || 'https://127.0.0.1';",
      "function f(url = 'http://localhost') { return url; }",
      "const a = { fallback: 'http://localhost:3001/#/x' };",
      "const a = { defaultValue: 'http://127.0.0.1:54321' };",
      'const a = url ?? `http://localhost:${port}`;',
      "options.url ??= 'http://localhost:3000';",
      "url ||= 'http://127.0.0.1';",
    ]) {
      expect(lint(code, { root: BARE })).toEqual([
        "Require the value instead, a `localhost` URL as a fallback is used wherever the setting is missing: `applicationEnvironment.getRequired(key)` (`import { applicationEnvironment } from '@venizia/ignis-helpers';`) or `RuntimeConfig.getRequired({ key })` (`import { RuntimeConfig } from '@venizia/ardor-kernel';`).",
      ]);
    }
  });

  test.each([
    ['another class', 'const is = error instanceof TypeError;'],
    ['process.argv', 'const a = process.argv;'],
    ['a name without the prefix', 'const a = process.env.PORT;'],
    ['the whole of process.env', 'const a = { ...process.env };'],
    ['a name held in a variable', 'const a = process.env[APP_ENV_PORT];'],
    ['an env of its own', 'const a = config.env.APP_ENV_PORT;'],
    ['a process of its own', 'function f(process) { return process.env.APP_ENV_PORT; }'],
    ['an assignment to a name', "process.env.APP_ENV_PORT = '1';"],
    ['a default written to a name', "process.env.APP_ENV_PORT ??= '1';"],
    ['a delete of a name', 'delete process.env.APP_ENV_PORT;'],
    ['a plain assignment of a localhost URL', "url = 'http://localhost:3000';"],
    ['a storage of its own', 'function f(localStorage) { return localStorage.getItem(1); }'],
    ['a storage guard', "const a = typeof localStorage === 'undefined';"],
    ['a localhost URL that is not a fallback', "const a = 'http://localhost:3000';"],
    ['a fallback after &&', "const a = isLocal && 'http://localhost:3000';"],
    ['a bare localhost host name', "const host = name ?? 'localhost';"],
    ['a host that only starts so', "const a = url ?? 'http://localhost.example.com';"],
    ['a later part of a template', 'const a = url ?? `${base}http://localhost`;'],
  ])('says nothing on %s', (_, code) => {
    expect([...lint(code), ...lint(code, { root: ARDOR })]).toEqual([]);
  });

  test('an extra row that lacks the field of its type is refused', () => {
    for (const match of [{ type: 'literal' }, { type: 'member' }, { type: 'selector' }]) {
      const row = { id: 'broken', message: 'Broken.', match };

      expect(() => lint("const a = 'text';", { entry: ['error', { extra: [row] }] })).toThrow();
    }
  });

  test('a row of a framework is silent in a project that does not depend on it', () => {
    const code =
      "const a = process.env.APP_ENV_PORT; const b = error instanceof ApplicationError; localStorage.getItem('a');";

    expect(lint(code, { root: BARE })).toEqual([]);
    expect(lint(code, { root: IGNIS })).toHaveLength(2);
    expect(lint(code, { root: ARDOR })).toHaveLength(1);
  });

  test('the package that owns the API is not reported', () => {
    const owner = project({
      name: '@venizia/ignis-helpers',
      dependencies: ['@venizia/ignis-inversion'],
    });

    expect(lint('const a = process.env.APP_ENV_PORT;', { root: owner })).toEqual([]);
    expect(lint('const a = error instanceof ApplicationError;', { root: owner })).toHaveLength(1);
  });

  test('hooks: false leaves the hook rows out and keeps these', () => {
    const code = 'export const useA = () => window.innerWidth + process.env.APP_ENV_A;';

    expect(lint(code)).toHaveLength(2);
    expect(lint(code, { hooks: false })).toHaveLength(1);
  });

  test('ignis-inversion, which writes isApplicationError, is not reported for instanceof', () => {
    const inversion = project({
      name: '@venizia/ignis-inversion',
      dependencies: ['@venizia/ignis-helpers'],
    });

    expect(lint('const a = error instanceof ApplicationError;', { root: inversion })).toEqual([]);
    expect(lint('const a = process.env.APP_ENV_PORT;', { root: inversion })).toHaveLength(1);
  });

  test('ignore takes the id of a row', () => {
    expect(lint('const a = process.env.APP_ENV_PORT;', { ignore: ['process-env'] })).toEqual([]);
  });

  const extra: IFrameworkApiPattern[] = [
    { id: 'no-pad', match: { type: 'import', sources: ['left-pad'] }, message: 'Use `padStart`.' },
    { id: 'no-with', match: { type: 'selector', selector: 'WithStatement' }, message: 'No with.' },
    {
      id: 'members',
      match: { type: 'selector', selector: 'MemberExpression[property.name="legacy"]' },
      message: 'Old.',
    },
  ];

  test('extra adds an import row: static, dynamic, not a type', () => {
    expect(lint("import pad from 'left-pad';", { extra })).toEqual(['Use `padStart`.']);
    expect(lint("const pad = import('left-pad');", { extra })).toEqual(['Use `padStart`.']);
    expect(lint("import type { Pad } from 'left-pad';", { extra })).toEqual([]);
    expect(lint("import { type Pad } from 'left-pad';", { extra })).toEqual([]);
    expect(lint("import pad from 'right-pad';", { extra })).toEqual([]);
  });

  test('extra adds a selector row, next to a visitor of the same node', () => {
    expect(lint('const a = thing.legacy;', { extra })).toEqual(['Old.']);
    expect(lint('const a = process.env.APP_ENV_PORT;', { extra })).toHaveLength(1);
  });

  test('houseConfigs turns the rule on, and off in tests', () => {
    const levels = houseConfigs.flatMap((config) => {
      const entry = config.rules?.[NAME];

      return entry === undefined ? [] : [[config.files, Array.isArray(entry) ? entry[0] : entry]];
    });

    expect(levels.map(([, level]) => level)).toEqual(['error', 'off']);
  });
});
