import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RepoTmp, REPO_TMP_DIRECTORY } from '../../testing/repo-tmp';
import { SpawnHelper } from '../../testing/spawn.helper';

const SCRATCH = join(__dirname, '../../../../../.agents/local/tmp');
mkdirSync(SCRATCH, { recursive: true });
const root = mkdtempSync(join(SCRATCH, 'repo-tmp-'));
mkdirSync(join(root, '.git'));
mkdirSync(join(root, 'packages/deep/src'), { recursive: true });

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('findRepositoryRoot', () => {
  test('walks up to the nearest folder holding .git', () => {
    expect(RepoTmp.findRoot({ start: join(root, 'packages/deep/src') })).toBe(root);
  });

  test('a .git file (a worktree) counts as the marker', () => {
    const worktree = join(root, 'worktree');
    mkdirSync(join(worktree, 'a'), { recursive: true });
    writeFileSync(join(worktree, '.git'), 'gitdir: elsewhere\n');

    expect(RepoTmp.findRoot({ start: join(worktree, 'a') })).toBe(worktree);
  });
});

describe('useRepoTmp (in a child process: it replaces Bun.spawn)', () => {
  const run = (opts: { env?: Record<string, string> } = {}) => {
    const result = SpawnHelper.spawnSyncBounded({
      cmd: ['bun', join(__dirname, 'fixtures/repo-tmp.script.ts'), root],
      env: { ...process.env, TMPDIR: '/somewhere/else', ...opts.env },
    });
    expect(result.exitCode).toBe(0);

    return JSON.parse(result.stdout.toString()) as Record<string, string>;
  };

  test('points TMPDIR and the git ceiling at the repository test folder and makes the .git marker', () => {
    const testTmp = join(root, REPO_TMP_DIRECTORY);
    const result = run();

    expect(result.first).toBe(testTmp);
    expect(result.ceiling).toBe(testTmp);
    expect(existsSync(join(testTmp, '.git'))).toBe(true);
  });

  test('is idempotent: a second call returns the same folder', () => {
    const result = run();

    expect(result.second).toBe(result.first);
  });

  test('a child spawned afterwards inherits the new TMPDIR, unless the caller passes an env', () => {
    const result = run();

    expect(result.child).toBe(result.first);
    expect(result.explicit).toBe('/explicit');
  });

  test('a TMPDIR already inside the test folder is left alone', () => {
    const inside = join(root, REPO_TMP_DIRECTORY, 'private');
    const result = run({ env: { TMPDIR: inside } });

    expect(result.first).toBe(inside);
  });
});
