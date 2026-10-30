import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CodemodCommand } from '../cli/codemod';
import { AsyncStyleCommand } from '../cli/codemod/async-style';

describe('devz codemod async-style', () => {
  let root: string;
  let logs: string[];
  let warnings: string[];
  let errors: string[];

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'async-'));
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

  const write = (path: string, content: string) => writeFileSync(join(root, path), content);
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const code = (args: string[]) => AsyncStyleCommand.run({ root, args });
  /** Commits the tree: `--write` only changes tracked files with no local changes. */
  const commit = () => {
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

  const INLINE = ['test("a", async () => {', '  expect(await f()).toBe(1);', '});', ''].join('\n');
  const INLINE_FIXED = [
    'test("a", async () => {',
    '  const result = await f();',
    '  expect(result).toBe(1);',
    '});',
    '',
  ].join('\n');
  const RETURN_AWAIT = 'export const run = async () => {\n  return await f();\n};\n';
  const RETURN_AWAIT_FIXED = 'export const run = async () => {\n  return f();\n};\n';
  // The catch reads the error: `catch { return 0; }` would be a venizia/no-silent-catch finding.
  const RETURN_IN_TRY = [
    'export const run = async () => {',
    '  try {',
    '    return await f();',
    '  } catch (error) {',
    '    return recover(error);',
    '  }',
    '};',
    '',
  ].join('\n');
  const RETURN_IN_TRY_FIXED = [
    'export const run = async () => {',
    '  try {',
    '    const result = await f();',
    '    return result;',
    '  } catch (error) {',
    '    return recover(error);',
    '  }',
    '};',
    '',
  ].join('\n');
  const CHAIN = [
    'export const load = async () => {',
    '  const user: string | undefined = await f().catch((error) => error.fallback);',
    '  return user;',
    '};',
    '',
  ].join('\n');
  // no-await-promise-chain writes `user = await f();` in the try, and no-inline-await then hoists it.
  const CHAIN_FIXED = [
    'export const load = async () => {',
    '  let user: string | undefined;',
    '  try {',
    '    const result = await f();',
    '    user = result;',
    '  } catch (error: any) {',
    '    user = error.fallback;',
    '  }',
    '  return user;',
    '};',
    '',
  ].join('\n');
  const CHAIN_NOT_FIXABLE = [
    'export const load = async () => {',
    '  const rows = await f().then((list) => list.map(toRow));',
    '  return rows;',
    '};',
    '',
  ].join('\n');
  // The await sits in a branch of a ternary: hoisting it would run it when the condition is false.
  const TERNARY = [
    'export const run = async (flag: boolean) => {',
    '  const value = flag ? await f() : 0;',
    '  return value;',
    '};',
    '',
  ].join('\n');

  test('--write turns expect(await f()) into a const and a plain statement', async () => {
    write('src/a.test.ts', INLINE);
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    expect(read('src/a.test.ts')).toBe(INLINE_FIXED);
    expect(logs.join('\n')).toContain('changed  src/a.test.ts  (1 fix(es))');
    expect(logs.join('\n')).toContain(
      'devz codemod async-style: 1 file(s) changed, 1 fix(es) applied, 0 left unfixed',
    );
  });

  test('return await f() outside a try becomes return f()', async () => {
    write('src/a.ts', RETURN_AWAIT);
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toBe(RETURN_AWAIT_FIXED);
  });

  test('return await f() inside a try becomes a const and a return of it', async () => {
    write('src/a.ts', RETURN_IN_TRY);
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toBe(RETURN_IN_TRY_FIXED);
  });

  test('an await that cannot be hoisted is left, and reported with its line and the rule', async () => {
    write('src/a.ts', TERNARY);
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toBe(TERNARY);
    expect(warnings.join('\n')).toContain('src/a.ts:2:');
    expect(warnings.join('\n')).toContain('venizia/no-inline-await');
    expect(logs.join('\n')).toContain(
      'devz codemod async-style: 0 file(s) changed, 0 fix(es) applied, 1 left unfixed',
    );
  });

  test('a file with a fixable and an unfixable await gets the first fixed and the second reported', async () => {
    write('src/a.ts', `${INLINE}${TERNARY}`);
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toBe(`${INLINE_FIXED}${TERNARY}`);
    expect(warnings.join('\n')).toContain('src/a.ts:6:');
    expect(logs.join('\n')).toContain('1 file(s) changed, 1 fix(es) applied, 1 left unfixed');
  });

  test('const x = await f().catch(h) becomes a let, a try and a catch', async () => {
    write('src/a.ts', CHAIN);
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toBe(CHAIN_FIXED);
    expect(logs.join('\n')).toContain('changed  src/a.ts  (1 fix(es))');
    expect(logs.join('\n')).toContain('1 file(s) changed, 1 fix(es) applied, 0 left unfixed');
  });

  test('an awaited .then is listed and left; so is the silent catch a fix leaves', async () => {
    const silentFallback =
      'export const load = async () => {\n  const user = await f().catch(() => null);\n  return user;\n};\n';
    write('src/a.ts', CHAIN_NOT_FIXABLE);
    write('src/b.ts', silentFallback);
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toBe(CHAIN_NOT_FIXABLE);
    expect(read('src/b.ts')).toContain('} catch (error) {\n    user = null;\n  }');
    expect(warnings.join('\n')).toContain('src/a.ts:2:16  venizia/no-await-promise-chain');
    expect(warnings.join('\n')).toContain('src/b.ts:6:5  venizia/no-silent-catch');
    expect(logs.join('\n')).toContain('1 file(s) changed, 1 fix(es) applied, 2 left unfixed');
  });

  test('a silent .catch in a file with no await is listed, never fixed', async () => {
    const source = 'export const warm = () => {\n  load().catch(() => undefined);\n};\n';
    write('src/a.ts', source);
    commit();

    const result = await code(['--check']);
    expect(result).toBe(1);
    expect(read('src/a.ts')).toBe(source);
    expect(warnings.join('\n')).toContain('src/a.ts:2:16  venizia/no-silent-catch');
  });

  test('the chain fix is idempotent, and --check is 0 once nothing is left', async () => {
    write('src/a.ts', CHAIN);
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    commit();
    logs.length = 0;

    const result2 = await code(['--write']);
    expect(result2).toBe(0);
    expect(read('src/a.ts')).toBe(CHAIN_FIXED);
    expect(logs.join('\n')).toContain('0 file(s) changed, 0 fix(es) applied, 0 left unfixed');
    const result3 = await code(['--check']);
    expect(result3).toBe(0);
  });

  test('without --write it lists what would change, writes nothing and exits 0', async () => {
    write('src/a.ts', RETURN_AWAIT);
    commit();

    const result = await code([]);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toBe(RETURN_AWAIT);
    expect(logs.join('\n')).toContain('would change  src/a.ts  (1 fix(es))');
    expect(logs.join('\n')).toContain('Nothing was written');
  });

  test('a dry run reads untracked files too, so it works before the first commit', async () => {
    write('src/a.ts', RETURN_AWAIT);

    const result = await code([]);
    expect(result).toBe(0);
    expect(logs.join('\n')).toContain('would change  src/a.ts');
  });

  test('--check exits 1 while a fix is pending or a report is left, and 0 when neither; it writes nothing', async () => {
    write('src/a.ts', RETURN_AWAIT);
    commit();
    const result = await code(['--check']);
    expect(result).toBe(1);
    expect(read('src/a.ts')).toBe(RETURN_AWAIT);

    write('src/a.ts', TERNARY);
    const result2 = await code(['--check']);
    expect(result2).toBe(1);

    write('src/a.ts', 'export const value = 1;\n');
    const result3 = await code(['--check']);
    expect(result3).toBe(0);
  });

  test('a second run changes nothing', async () => {
    write('src/a.test.ts', INLINE);
    write('src/b.ts', RETURN_IN_TRY);
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    commit();
    logs.length = 0;

    const result2 = await code(['--write']);
    expect(result2).toBe(0);
    expect(logs.join('\n')).toContain(
      'devz codemod async-style: 0 file(s) changed, 0 fix(es) applied, 0 left unfixed',
    );
    const result3 = await code(['--check']);
    expect(result3).toBe(0);
    expect(read('src/a.test.ts')).toBe(INLINE_FIXED);
    expect(read('src/b.ts')).toBe(RETURN_IN_TRY_FIXED);
  });

  test('--write refuses a file with local changes, an untracked file and a staged one, and exits 1', async () => {
    write('src/a.ts', RETURN_AWAIT);
    write('src/b.ts', RETURN_AWAIT);
    write('src/c.ts', 'export const value = 1;\n');
    commit();
    write('src/a.ts', `${RETURN_AWAIT}// edited\n`);
    write('src/c.ts', RETURN_AWAIT);
    execFileSync('git', ['add', 'src/c.ts'], { cwd: root });
    write('src/d.ts', RETURN_AWAIT);

    const result = await code(['--write']);
    expect(result).toBe(1);
    expect(read('src/a.ts')).toBe(`${RETURN_AWAIT}// edited\n`);
    expect(read('src/c.ts')).toBe(RETURN_AWAIT);
    expect(read('src/d.ts')).toBe(RETURN_AWAIT);
    expect(read('src/b.ts')).toBe(RETURN_AWAIT_FIXED);
    expect(warnings.join('\n')).toContain('refused  src/a.ts  has local changes');
    expect(warnings.join('\n')).toContain('refused  src/c.ts');
    expect(warnings.join('\n')).toContain('refused  src/d.ts');
    expect(logs.join('\n')).toContain(
      '1 file(s) changed, 1 fix(es) applied, 0 left unfixed, 3 refused',
    );
  });

  test('a path argument narrows the files', async () => {
    mkdirSync(join(root, 'lib'));
    write('src/a.ts', RETURN_AWAIT);
    write('lib/b.ts', RETURN_AWAIT);
    commit();

    const result = await code(['--write', 'lib']);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toBe(RETURN_AWAIT);
    expect(read('lib/b.ts')).toBe(RETURN_AWAIT_FIXED);
  });

  test('only TypeScript files are read, and ignored folders are never entered', async () => {
    mkdirSync(join(root, 'src/generated'));
    write('.gitignore', 'src/generated/\n');
    write('src/a.js', RETURN_AWAIT);
    write('src/a.mjs', RETURN_AWAIT);
    write('src/notes.md', RETURN_AWAIT);
    write('src/a.d.ts', RETURN_AWAIT);
    write('src/generated/b.ts', RETURN_AWAIT);
    commit();

    const result = await code(['--check']);
    expect(result).toBe(0);
    expect(logs.join('\n')).toContain('0 file(s) would change');
  });

  test('a .mts, .cts and .tsx file are read', async () => {
    write('src/a.mts', RETURN_AWAIT);
    write('src/b.cts', RETURN_AWAIT);
    write('src/c.tsx', RETURN_AWAIT);
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    expect(read('src/a.mts')).toBe(RETURN_AWAIT_FIXED);
    expect(read('src/b.cts')).toBe(RETURN_AWAIT_FIXED);
    expect(read('src/c.tsx')).toBe(RETURN_AWAIT_FIXED);
  });

  test('only the async-style rules run: other findings are not reported', async () => {
    write(
      'src/a.ts',
      'export const run = async (x: any) => { var y = await f(); throw new Error(y); };\n',
    );
    commit();

    const result = await code(['--check']);
    expect(result).toBe(0);
    expect(warnings).toEqual([]);
  });

  test('a disable directive for another rule is kept, though that rule is not run here', async () => {
    const directive = '  // eslint-disable-next-line venizia/no-new-error -- a reason';
    const source = [
      'export const run = async () => {',
      directive,
      "  throw new Error('x');",
      '};',
      'export const read = async () => {',
      '  return await f();',
      '};',
      '',
    ].join('\n');
    write('src/a.ts', source);
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    expect(read('src/a.ts')).toContain(directive);
    expect(read('src/a.ts')).toContain('return f();');
  });

  test('a file that does not parse is reported, not thrown', async () => {
    write('src/a.ts', 'export const run = async () => { await ;\n');
    commit();

    const result = await code(['--write']);
    expect(result).toBe(0);
    expect(warnings.join('\n')).toContain('src/a.ts:');
    expect(warnings.join('\n')).toContain('parse error');
  });

  test('--help exits 0; an unknown flag and --write with --check exit 2', async () => {
    write('src/a.ts', RETURN_AWAIT);
    commit();

    const result = await code(['--help']);
    expect(result).toBe(0);
    expect(logs.join('\n')).toContain('Usage: devz codemod async-style');
    const result2 = await code(['--halp']);
    expect(result2).toBe(2);
    const result3 = await code(['--write', '--check']);
    expect(result3).toBe(2);
    expect(errors.join('\n')).toContain('unknown option "--halp"');
    expect(read('src/a.ts')).toBe(RETURN_AWAIT);
  });

  test('devz codemod dispatches to it, and --help lists it', async () => {
    write('src/a.ts', RETURN_AWAIT);

    const result = await CodemodCommand.run({ root, args: ['async-style', '--check'] });
    expect(result).toBe(1);
    logs.length = 0;
    const result2 = await CodemodCommand.run({ root, args: ['--help'] });
    expect(result2).toBe(0);
    expect(logs.join('\n')).toContain('devz codemod async-style');
  });
});
