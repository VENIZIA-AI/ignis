import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CodemodCommand } from '../cli/codemod';
import { EnvGet } from '../cli/codemod/env-get';

const rewrite = (source: string, fileName = 'file.ts') =>
  EnvGet.rewrite({ typescript: ts, fileName, source });

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
    expect(result.manual).toEqual([]);
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
    expect(result.manual).toEqual([2]);
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
    expect(result.manual).toEqual([4]);
    expect(result.manualTypes).toEqual(['string | null']);
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
    expect(result.manual).toEqual([3]);
    expect(result.manualTypes).toEqual(['unknown']);
  });

  test('a receiver bound by an import alias or a const alias is rewritten', () => {
    const result = rewrite(
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
    const result = rewrite(
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
    expect(result.manual).toEqual([1]);
  });

  test('a union that is not string or string | undefined is listed as manual', () => {
    expect(rewrite(`const a = AppEnvs.get<string | null>(KEY);\n`).manual).toEqual([1]);
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
  const OLD = `const a = applicationEnvironment.get<string>(KEY);\n`;
  const NEW = `const a = applicationEnvironment.get(KEY);\n`;

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

    writeFileSync(join(root, 'src/m.ts'), `const t = AppEnvs.get<number>(KEY);\n`);
    execFileSync('git', ['add', '-A'], { cwd: root });
    const code3 = await CodemodCommand.run({ root, args: ['env-get', '--check'] });
    expect(code3).toBe(1);
    expect(warnings.join('\n')).toContain('manual  src/m.ts:1');
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
