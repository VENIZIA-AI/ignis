import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { EnvGet } from '../cli/codemod/env-get';

const rewriteRaw = (source: string, fileName = 'file.ts', numbers = false) =>
  EnvGet.rewrite({ typescript: ts, fileName, source, numbers });

/** The store import every fixture of these tests needs: a name nobody imported is not the store. It sits on the first line, so line numbers stay the fixture's own. */
const STORE_IMPORT = `import { applicationEnvironment, AppEnvs } from '@venizia/ignis-helpers'; `;

const rewrite = (source: string, fileName = 'file.ts', numbers = false) => {
  const result = rewriteRaw(`${STORE_IMPORT}${source}`, fileName, numbers);

  return { ...result, output: result.output.slice(STORE_IMPORT.length) };
};

describe('devz codemod env-get: the rewrite', () => {
  test('get<string> loses its type argument, with or without options', () => {
    const result = rewrite(
      [
        `const a = applicationEnvironment.get<string>(KEY);`,
        `const b = AppEnvs.get<string>(KEY, { defaultValue: 'x' });`,
        '',
      ].join('\n'),
    );

    expect(result.output).toBe(
      [
        `const a = applicationEnvironment.get(KEY);`,
        `const b = AppEnvs.get(KEY, { defaultValue: 'x' });`,
        '',
      ].join('\n'),
    );
    expect(result.rewritten).toBe(2);
    expect(result.manual.map((item) => item.line)).toEqual([]);
  });

  test('get<R, B> keeps R only', () => {
    const result = rewrite(
      `const n = applicationEnvironment.get<number | undefined, string>(KEY, { transform });\n`,
    );

    expect(result.output).toBe(
      `const n = applicationEnvironment.get<number | undefined>(KEY, { transform });\n`,
    );
  });

  test('another type argument is listed as manual and left alone', () => {
    const source = `\nconst t = applicationEnvironment.get<number>(KEY);\n`;
    const result = rewrite(source);

    expect(result.changed).toBe(false);
    expect(result.output).toBe(source);
    expect(result.manual.map((item) => item.line)).toEqual([2]);
  });

  test('get<string | undefined> loses its type argument too, in either order', () => {
    const result = rewrite(
      [
        `const a = applicationEnvironment.get<string | undefined>(KEY);`,
        `const b = applicationEnvironment.get<undefined | string>(KEY);`,
        `const c = applicationEnvironment.get<(string | undefined)>(KEY, { defaultValue: 'x' });`,
        `const d = applicationEnvironment.get<string | null>(KEY);`,
        '',
      ].join('\n'),
    );

    expect(result.output).toBe(
      [
        `const a = applicationEnvironment.get(KEY);`,
        `const b = applicationEnvironment.get(KEY);`,
        `const c = applicationEnvironment.get(KEY, { defaultValue: 'x' });`,
        `const d = applicationEnvironment.get<string | null>(KEY);`,
        '',
      ].join('\n'),
    );
    expect(result.rewritten).toBe(3);
    expect(result.manual.map((item) => item.line)).toEqual([4]);
    expect(result.manual.map((item) => item.type)).toEqual(['string | null']);
  });

  test('the two-type-argument form with options keeps its first type argument, whatever it is', () => {
    const result = rewrite(
      [
        `const a = AppEnvs.get<string[], string>(KEY, { transform });`,
        `const b = AppEnvs.get<Config['nodes'], string>(KEY, { transform });`,
        `const c = AppEnvs.get<unknown>(KEY);`,
        '',
      ].join('\n'),
    );

    expect(result.output).toBe(
      [
        `const a = AppEnvs.get<string[]>(KEY, { transform });`,
        `const b = AppEnvs.get<Config['nodes']>(KEY, { transform });`,
        `const c = AppEnvs.get<unknown>(KEY);`,
        '',
      ].join('\n'),
    );
    expect(result.rewritten).toBe(2);
    expect(result.manual.map((item) => item.line)).toEqual([3]);
    expect(result.manual.map((item) => item.type)).toEqual(['unknown']);
  });

  test('a receiver bound by an import alias or a const alias is rewritten', () => {
    const result = rewriteRaw(
      [
        `import { applicationEnvironment as AppEnv, AppEnvs as Envs } from '@venizia/ignis-helpers';`,
        `const env = AppEnv;`,
        `const a = AppEnv.get<string>(KEY);`,
        `const b = Envs.get<string>(KEY);`,
        `const c = env.get<string>(KEY);`,
        '',
      ].join('\n'),
    );

    expect(result.rewritten).toBe(3);
    expect(result.output).toContain(`const a = AppEnv.get(KEY);`);
    expect(result.output).toContain(`const c = env.get(KEY);`);
    expect(result.skipped).toEqual([]);
  });

  test('a name nobody imported is not a receiver, and the call is listed as skipped', () => {
    const result = rewriteRaw(
      [
        `const a = AppEnv.get<string>(KEY);`,
        `const b = this.env.get<string>(KEY);`,
        `const c = applicationEnvironment?.get<string>(KEY);`,
        `const d = container.get<Service>({ key: 'service' });`,
        '',
      ].join('\n'),
    );

    expect(result.changed).toBe(false);
    expect(result.skipped).toEqual([
      { line: 1, receiver: 'AppEnv' },
      { line: 2, receiver: 'this.env' },
      { line: 3, receiver: 'applicationEnvironment' },
    ]);
  });

  test('a shadowing parameter, a same-named local and a barrel import are not the store', () => {
    const result = rewriteRaw(
      [
        `import { AppEnvs } from '@venizia/ignis-helpers';`,
        `import { applicationEnvironment as Barrel } from './barrel';`,
        `const real = AppEnvs.get<string>(KEY);`,
        `const viaBarrel = Barrel.get<string>(KEY);`,
        `export const shadowed = (AppEnvs: Map<string, string>) => AppEnvs.get<string>(KEY);`,
        `export const local = () => {`,
        `  const AppEnvs = new Map<string, number>();`,
        `  return AppEnvs.get<number>(KEY);`,
        `};`,
        '',
      ].join('\n'),
    );

    expect(result.rewritten).toBe(1);
    expect(result.output).toContain(`const real = AppEnvs.get(KEY);`);
    expect(result.output).toContain(`Barrel.get<string>(KEY)`);
    expect(result.output).toContain(`AppEnvs.get<string>(KEY);`);
    expect(result.manual).toEqual([]);
    expect(result.skipped.map((item) => item.line)).toEqual([4, 5, 8]);
  });

  test('a const alias is scoped: one inside a function does not leak, a top-level one is a receiver, a same-named local Map is not', () => {
    const result = rewriteRaw(
      [
        `import { AppEnvs } from '@venizia/ignis-helpers';`,
        `const top = AppEnvs;`,
        `export const a = top.get<string>(KEY);`,
        `export const f = () => {`,
        `  const env = AppEnvs;`,
        `  return env.get<string>(KEY);`,
        `};`,
        `const env = new Map<string, string>();`,
        `export const b = env.get<string>(KEY);`,
        '',
      ].join('\n'),
    );

    expect(result.output).toContain(`export const a = top.get(KEY);`);
    expect(result.output).toContain(`return env.get(KEY);`);
    expect(result.output).toContain(`export const b = env.get<string>(KEY);`);
    expect(result.rewritten).toBe(2);
    expect(result.skipped).toEqual([{ line: 9, receiver: 'env' }]);
  });

  test('a call already in the new form is left alone and not listed, and a second run changes nothing', () => {
    const source = [
      `const a = AppEnvs.get<number>(KEY, { transform: Number });`,
      `const b = AppEnvs.get<string>(KEY, { transform, defaultValue: 'x' });`,
      `const c = AppEnvs.get<string, string>(KEY, { transform });`,
      `const d = AppEnvs.get<string>(KEY);`,
      '',
    ].join('\n');
    const first = rewrite(source);

    expect(first.output).toBe(
      [
        `const a = AppEnvs.get<number>(KEY, { transform: Number });`,
        `const b = AppEnvs.get<string>(KEY, { transform, defaultValue: 'x' });`,
        `const c = AppEnvs.get<string>(KEY, { transform });`,
        `const d = AppEnvs.get(KEY);`,
        '',
      ].join('\n'),
    );
    expect(first.manual).toEqual([]);

    const second = rewrite(first.output);

    expect(second.changed).toBe(false);
    expect(second.manual).toEqual([]);
  });

  test('a call with a variable as options and a one-type-argument form is left alone, so --check passes after --write', async () => {
    const source = [
      `const a = AppEnvs.get<string, string>(KEY, opts);`,
      `const b = AppEnvs.get<number, string>(KEY, opts);`,
      `const c = AppEnvs.get<string>(KEY, opts);`,
      '',
    ].join('\n');
    const first = rewrite(source);

    expect(first.output).toBe(
      [
        `const a = AppEnvs.get<string>(KEY, opts);`,
        `const b = AppEnvs.get<number>(KEY, opts);`,
        `const c = AppEnvs.get<string>(KEY, opts);`,
        '',
      ].join('\n'),
    );
    expect(first.manual).toEqual([]);

    const second = rewrite(first.output);

    expect(second.changed).toBe(false);
    expect(second.manual).toEqual([]);
  });

  test('a let alias is not a receiver, a const alias is', () => {
    const result = rewriteRaw(
      [
        `import { AppEnvs } from '@venizia/ignis-helpers';`,
        `let loose = AppEnvs;`,
        `const fixed = AppEnvs;`,
        `export const a = loose.get<string>(KEY);`,
        `export const b = fixed.get<string>(KEY);`,
        '',
      ].join('\n'),
    );

    expect(result.rewritten).toBe(1);
    expect(result.skipped).toEqual([{ line: 4, receiver: 'loose' }]);
  });

  test('--numbers rewrites a number read to a transform, keeps a defaultValue, and joins ParseUtility to the store import', () => {
    const result = rewriteRaw(
      [
        `import { AppEnvs } from '@venizia/ignis-helpers';`,
        `export const a = AppEnvs.get<number>(KEY);`,
        `export const b = AppEnvs.get<number | undefined>(KEY, { defaultValue: 3000 });`,
        `export const c = AppEnvs.get<number>(KEY, {});`,
        '',
      ].join('\n'),
      'file.ts',
      true,
    );

    expect(result.output).toBe(
      [
        `import { AppEnvs, ParseUtility } from '@venizia/ignis-helpers';`,
        `export const a = AppEnvs.get(KEY, { transform: (raw) => ParseUtility.toNumber({ input: raw }) });`,
        `export const b = AppEnvs.get(KEY, { transform: (raw) => ParseUtility.toNumber({ input: raw }), defaultValue: 3000 });`,
        `export const c = AppEnvs.get(KEY, { transform: (raw) => ParseUtility.toNumber({ input: raw }),});`,
        '',
      ].join('\n'),
    );
    expect(result.numbered).toEqual([2, 3, 4]);
    expect(result.rewritten).toBe(3);
    expect(result.manual).toEqual([]);
  });

  test('--numbers uses the ParseUtility the file already imports, adds a new import beside a type-only one, and is idempotent', () => {
    const existing = rewriteRaw(
      [
        `import { AppEnvs, ParseUtility as Parse } from '@venizia/ignis-helpers';`,
        `export const a = AppEnvs.get<number>(KEY);`,
        '',
      ].join('\n'),
      'file.ts',
      true,
    );

    expect(existing.output).toContain(`Parse.toNumber({ input: raw })`);
    expect(existing.output).not.toContain(`ParseUtility.toNumber`);

    const typeOnly = rewriteRaw(
      [
        `import type { AppEnvs } from '@venizia/ignis-helpers';`,
        `export const a = AppEnvs.get<number>(KEY);`,
        '',
      ].join('\n'),
      'file.ts',
      true,
    );

    expect(typeOnly.output).toContain(`import { ParseUtility } from '@venizia/ignis-helpers';`);

    const second = rewriteRaw(existing.output, 'file.ts', true);

    expect(second.changed).toBe(false);
    expect(second.manual).toEqual([]);
  });

  test('without --numbers a number read stays manual; with it a boolean, unknown and options that are not a literal stay manual', () => {
    const source = [
      `export const a = AppEnvs.get<number>(KEY);`,
      `export const b = AppEnvs.get<boolean>(KEY);`,
      `export const c = AppEnvs.get<unknown>(KEY);`,
      `export const d = AppEnvs.get<number>(KEY, opts);`,
      '',
    ].join('\n');

    expect(rewrite(source).manual.map((item) => item.line)).toEqual([1, 2, 3]);

    const withNumbers = rewrite(source, 'file.ts', true);

    expect(withNumbers.numbered).toEqual([1]);
    expect(withNumbers.manual.map((item) => item.type)).toEqual(['boolean', 'unknown']);
  });

  test('a get on another receiver is not touched', () => {
    const source = `const s = container.get<string>({ key });\n`;

    expect(rewrite(source).changed).toBe(false);
  });

  test('a call with no type argument is not touched', () => {
    expect(rewrite(`const s = applicationEnvironment.get(KEY);\n`).changed).toBe(false);
  });
});

describe('devz codemod env-get: edge cases', () => {
  test('a multi-line call, a nested call and a .tsx file are rewritten', () => {
    const multi = rewrite(`const a = applicationEnvironment.get<string>(\n  KEY,\n);\n`);
    const nested = rewrite(`const b = f(applicationEnvironment.get<string>(KEY));\n`);
    const tsx = rewrite(`const c = <p>{AppEnvs.get<string>(KEY)}</p>;\n`, 'file.tsx');

    expect(multi.output).toBe(`const a = applicationEnvironment.get(\n  KEY,\n);\n`);
    expect(nested.output).toBe(`const b = f(applicationEnvironment.get(KEY));\n`);
    expect(tsx.output).toBe(`const c = <p>{AppEnvs.get(KEY)}</p>;\n`);
  });

  test('an optional chain is left alone, so its question mark is not dropped', () => {
    expect(rewrite(`const a = applicationEnvironment?.get<string>(KEY);\n`).changed).toBe(false);
  });

  test('two type arguments with no options argument are listed as manual', () => {
    const result = rewrite(`const a = AppEnvs.get<string, number>(KEY);\n`);

    expect(result.changed).toBe(false);
    expect(result.manual.map((item) => item.line)).toEqual([1]);
  });

  test('a union that is not string or string | undefined is listed as manual', () => {
    expect(
      rewrite(`const a = AppEnvs.get<string | null>(KEY);\n`).manual.map((item) => item.line),
    ).toEqual([1]);
  });
});

describe('devz codemod env-get: the command', () => {
  let root: string;
  let logs: string[];
  let warnings: string[];
  let errors: string[];

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'env-get-'));
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
  const IMPORT_LINE = `import { applicationEnvironment, AppEnvs } from '@venizia/ignis-helpers';\n`;
  const OLD = `${IMPORT_LINE}const a = applicationEnvironment.get<string>(KEY);\n`;
  const NEW = `${IMPORT_LINE}const a = applicationEnvironment.get(KEY);\n`;

  test('a dry run lists the file and writes nothing', async () => {
    commit({ 'src/a.ts': OLD });

    const code = await CodemodCommand.run({ root, args: ['env-get'] });

    expect(code).toBe(0);
    expect(read('src/a.ts')).toBe(OLD);
    expect(logs.join('\n')).toContain('would change  src/a.ts');
  });

  test('--write --all rewrites a committed file and touches only a file with the old text', async () => {
    commit({ 'src/a.ts': OLD, 'src/b.ts': 'export const b = 1;\n' });

    const code = await CodemodCommand.run({ root, args: ['env-get', '--write', '--all'] });

    expect(code).toBe(0);
    expect(read('src/a.ts')).toBe(NEW);
    expect(read('src/b.ts')).toBe('export const b = 1;\n');
  });

  test('a bare --write with no path is refused and writes nothing', async () => {
    commit({ 'src/a.ts': OLD });

    const code = await CodemodCommand.run({ root, args: ['env-get', '--write'] });

    expect(code).toBe(2);
    expect(errors.join('\n')).toContain('--write needs a path, or --all');
    expect(read('src/a.ts')).toBe(OLD);
  });

  test('--write with a path rewrites just that path', async () => {
    commit({ 'src/a.ts': OLD });

    const code = await CodemodCommand.run({ root, args: ['env-get', '--write', 'src/a.ts'] });

    expect(code).toBe(0);
    expect(read('src/a.ts')).toBe(NEW);
  });

  test('--write refuses a file with local changes and exits 1', async () => {
    commit({ 'src/a.ts': OLD });
    writeFileSync(join(root, 'src/a.ts'), `${OLD}// edited\n`);

    const code = await CodemodCommand.run({ root, args: ['env-get', '--write', 'src/a.ts'] });

    expect(code).toBe(1);
    expect(read('src/a.ts')).toBe(`${OLD}// edited\n`);
    expect(warnings.join('\n')).toContain('refused  src/a.ts  has local changes');
  });

  test('--check exits 1 while a file would change or a call is manual, and 0 when none is', async () => {
    commit({ 'src/a.ts': OLD });
    const code1 = await CodemodCommand.run({ root, args: ['env-get', '--check'] });
    expect(code1).toBe(1);

    await CodemodCommand.run({ root, args: ['env-get', '--write', '--all'] });
    execFileSync('git', ['add', '-A'], { cwd: root });
    const code2 = await CodemodCommand.run({ root, args: ['env-get', '--check'] });
    expect(code2).toBe(0);

    writeFileSync(join(root, 'src/m.ts'), `${IMPORT_LINE}const t = AppEnvs.get<number>(KEY);\n`);
    execFileSync('git', ['add', '-A'], { cwd: root });
    const code3 = await CodemodCommand.run({ root, args: ['env-get', '--check'] });
    expect(code3).toBe(1);
    expect(warnings.join('\n')).toContain('manual  src/m.ts:2');
  });

  test('--check passes on migrated code after --write, and a file with only a .get?.<T> or .get/**/<T> call is still read and listed', async () => {
    commit({
      'src/a.ts': OLD,
      'src/o.ts': `${IMPORT_LINE}export const o = AppEnvs.get?.<string>(KEY);\nexport const c = AppEnvs.get/* c */<string>(KEY);\n`,
    });

    await CodemodCommand.run({ root, args: ['env-get', '--write', '--all'] });
    execFileSync('git', ['add', '-A'], { cwd: root });
    warnings.length = 0;
    const code = await CodemodCommand.run({ root, args: ['env-get', '--check'] });

    expect(code).toBe(0);
    expect(warnings.join('\n')).toContain('skipped  src/o.ts:2');
    expect(read('src/a.ts')).toBe(NEW);
  });

  test('the report lists skipped calls with file and line and ends with the manual calls by type argument', async () => {
    commit({
      'src/a.ts': `${IMPORT_LINE}export const n = AppEnvs.get<number>(KEY);\nexport const m = AppEnvs.get<number>(KEY, { defaultValue: 3 });\nexport const u = AppEnvs.get<unknown>(KEY);\n`,
      'src/s.ts': `export const s = settings.get<string>(KEY);\n`,
    });

    await CodemodCommand.run({ root, args: ['env-get'] });

    expect(warnings.join('\n')).toContain('manual  src/a.ts:2  get<number>');
    expect(warnings.join('\n')).toContain('skipped  src/s.ts:1  settings.get<...>()');
    expect(logs.join('\n')).toContain('manual by type argument: number x2, unknown x1');
    expect(logs.join('\n')).toContain('3 manual, 1 skipped');
  });

  test('--numbers lists every rewrite and counts it in the summary', async () => {
    commit({
      'src/n.ts': `${IMPORT_LINE}export const n = AppEnvs.get<number>(KEY);\n`,
    });

    const code = await CodemodCommand.run({
      root,
      args: ['env-get', '--numbers', '--write', 'src/n.ts'],
    });

    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('numbers  src/n.ts:2');
    expect(logs.join('\n')).toContain('1 number read(s) rewritten');
    expect(read('src/n.ts')).toContain('ParseUtility.toNumber({ input: raw })');
  });

  test('--reverse is refused with exit 2, and an unknown option is a usage error', async () => {
    commit({ 'src/a.ts': OLD });

    const code4 = await CodemodCommand.run({ root, args: ['env-get', '--reverse'] });
    expect(code4).toBe(2);
    const code5 = await CodemodCommand.run({ root, args: ['env-get', '--force'] });
    expect(code5).toBe(2);
    expect(errors.join('\n')).toContain('unknown option "--force"');
    expect(read('src/a.ts')).toBe(OLD);
  });
});
