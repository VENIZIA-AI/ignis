import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CodemodCommand } from '../cli/codemod';

/**
 * `--write` with no path used to rewrite every source file under the working directory. For the codemods that
 * rewrite broadly (a style sweep, a type rewrite) that is how 134 clean files changed from one command typed
 * without a path. They now need a path or an explicit `--all`. `model-settings` and `namespace-functions` keep
 * their default: their documented upgrade step is the bare `--write`, and they touch only a file that holds the
 * old text.
 */
describe('devz codemod --write without a path', () => {
  let root: string;
  let errors: string[];
  let logs: string[];

  beforeEach(() => {
    const scratch = join(process.cwd(), 'app_data');
    mkdirSync(scratch, { recursive: true });
    root = mkdtempSync(join(scratch, 'scope-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'src'), { recursive: true });
    errors = [];
    logs = [];
    spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });
    spyOn(console, 'warn').mockImplementation(() => {});
    spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
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
  const run = (args: string[]) => CodemodCommand.run({ root, args });

  const INLINE = 'test("a", async () => {\n  expect(await f()).toBe(1);\n});\n';
  const UNION = "export type TMode = 'read' | 'write';\n";

  describe('async-style', () => {
    test('is refused: exit 2, a message naming --all, and no file is touched', async () => {
      commit({ 'src/a.test.ts': INLINE });

      const code = await run(['async-style', '--write']);

      expect(code).toBe(2);
      expect(errors.join('\n')).toContain('--all');
      expect(read('src/a.test.ts')).toBe(INLINE);
    });

    test('with --all it rewrites the whole tree', async () => {
      commit({ 'src/a.test.ts': INLINE });

      const code = await run(['async-style', '--write', '--all']);

      expect(code).toBe(0);
      expect(read('src/a.test.ts')).not.toBe(INLINE);
    });

    test('with a path it rewrites that path', async () => {
      commit({ 'src/a.test.ts': INLINE });

      const code = await run(['async-style', '--write', 'src']);

      expect(code).toBe(0);
      expect(read('src/a.test.ts')).not.toBe(INLINE);
    });

    test('a dry run with no path still lists, and writes nothing', async () => {
      commit({ 'src/a.test.ts': INLINE });

      const code = await run(['async-style']);

      expect(code).toBe(0);
      expect(logs.join('\n')).toContain('would change');
      expect(read('src/a.test.ts')).toBe(INLINE);
    });

    test('--check with no path still checks the tree', async () => {
      commit({ 'src/a.test.ts': INLINE });

      const code1 = await run(['async-style', '--check']);
      expect(code1).toBe(1);
    });

    test('--all together with a path is a contradiction', async () => {
      commit({ 'src/a.test.ts': INLINE });

      const code = await run(['async-style', '--write', '--all', 'src']);

      expect(code).toBe(2);
      expect(read('src/a.test.ts')).toBe(INLINE);
    });
  });

  describe('const-classes', () => {
    test('--write with no path is refused and touches nothing', async () => {
      commit({ 'src/a.ts': UNION });

      const code = await run(['const-classes', '--write']);

      expect(code).toBe(2);
      expect(errors.join('\n')).toContain('--all');
      expect(read('src/a.ts')).toBe(UNION);
    });

    test('--write with a path, and --write --all, are accepted', async () => {
      commit({ 'src/a.ts': UNION });

      const code2 = await run(['const-classes', '--write', 'src']);
      expect(code2).not.toBe(2);
      const code3 = await run(['const-classes', '--write', '--all']);
      expect(code3).not.toBe(2);
    });

    test('a dry run with no path is not refused', async () => {
      commit({ 'src/a.ts': UNION });

      const code4 = await run(['const-classes']);
      expect(code4).not.toBe(2);
    });
  });

  describe('drop-redundant-casts', () => {
    test('--write with no path is refused and touches nothing', async () => {
      const source = 'export const value = 1 as number;\n';
      commit({ 'src/a.ts': source });

      const code = await run(['drop-redundant-casts', '--write']);

      expect(code).toBe(2);
      expect(errors.join('\n')).toContain('--all');
      expect(read('src/a.ts')).toBe(source);
    });

    test('--all together with a path is a contradiction', async () => {
      commit({ 'src/a.ts': UNION });

      const code5 = await run(['drop-redundant-casts', '--write', '--all', 'src']);
      expect(code5).toBe(2);
    });

    test('a dry run with no path is not refused', async () => {
      commit({ 'src/a.ts': UNION });

      const code6 = await run(['drop-redundant-casts']);
      expect(code6).not.toBe(2);
    });
  });

  describe('the codemods whose documented step is the bare --write', () => {
    test('model-settings rewrites with no path', async () => {
      const model =
        "@model({ type: 'entity', settings: { defaultLimit: 20 } })\nclass Product {}\n";
      commit({ 'src/a.ts': model });

      const code = await run(['model-settings', '--write']);

      expect(code).toBe(0);
      expect(read('src/a.ts')).not.toBe(model);
    });

    test('namespace-functions rewrites with no path', async () => {
      const source =
        "import { isMailTransport } from '@venizia/ignis/mail';\nexport const ok = isMailTransport({});\n";
      commit({ 'src/a.ts': source });

      const code = await run(['namespace-functions', '--write']);

      expect(code).toBe(0);
      expect(read('src/a.ts')).toContain('MailTypeUtility.isTransport');
    });
  });
});
