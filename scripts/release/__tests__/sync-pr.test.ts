import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MergeBackConstants, ReleaseMergeBack } from '../merge-back';
import { ReleaseSyncPr } from '../sync-pr';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const git = (opts: { cwd: string; args: string[] }): string =>
  ReleaseMergeBack.mustGit({ cwd: opts.cwd, args: [...MergeBackConstants.IDENTITY, ...opts.args] });

const commit = (opts: { root: string; version: string; file?: string; message: string }): void => {
  const path = join(opts.root, 'packages', 'kernel', 'package.json');

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ name: 'x', version: opts.version }, null, 2)}\n`);

  if (opts.file !== undefined) {
    writeFileSync(join(opts.root, opts.file), `${opts.message}\n`);
  }

  git({ cwd: opts.root, args: ['add', '-A'] });
  git({ cwd: opts.root, args: ['commit', '-q', '-m', opts.message] });
};

/** main at the last stable, develop two prerelease commits ahead of it, the second one tagged. */
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'sync-pr-test-'));

  roots.push(root);
  git({ cwd: root, args: ['init', '-q', '-b', 'main'] });
  commit({ root, version: '0.4.8', message: 'chore(release): v0.4.8 [patch]' });
  git({ cwd: root, args: ['checkout', '-q', '-b', 'develop'] });
  commit({ root, version: '0.4.9-0', file: 'a.txt', message: '[#10] feat(a): first change' });
  commit({ root, version: '0.4.9-1', file: 'b.txt', message: '[#11] fix(b): second change' });
  git({ cwd: root, args: ['tag', '-a', 'kernel-v0.4.9-1', '-m', 'gated'] });
  commit({ root, version: '0.4.9-2', file: 'c.txt', message: '[#12] feat(c): after the tag' });

  return root;
};

const check = (opts: { cwd: string; tag: string }) =>
  ReleaseSyncPr.check({ ...opts, main: 'main', develop: 'develop' });

describe('ReleaseSyncPr.check', () => {
  test('a gated prerelease tag on develop, with main inside it, can be synced, and the commits after the tag stay out', () => {
    const root = fixture();
    const checked = check({ cwd: root, tag: 'kernel-v0.4.9-1' });

    expect(checked.problems).toEqual([]);
    expect(checked.version).toBe('0.4.9-1');
    expect(checked.commit).toBe(
      git({ cwd: root, args: ['rev-parse', 'kernel-v0.4.9-1^{commit}'] }),
    );
    expect(checked.subjects).toEqual([
      '[#11] fix(b): second change',
      '[#10] feat(a): first change',
    ]);
  });

  test('a name that is not a tag is refused, a branch name included', () => {
    expect(check({ cwd: fixture(), tag: 'kernel-v9.9.9-0' }).problems[0]).toContain(
      'is not a tag here',
    );
  });

  test('a stable tag is refused: a Sync is cut from a gated prerelease', () => {
    const root = fixture();

    git({ cwd: root, args: ['tag', '-a', 'kernel-v0.4.8', '-m', 'stable', 'main'] });

    expect(check({ cwd: root, tag: 'kernel-v0.4.8' }).problems.join('\n')).toContain(
      'not a prerelease',
    );
  });

  test('a tag that is not in develop is refused', () => {
    const root = fixture();

    git({ cwd: root, args: ['checkout', '-q', '-b', 'elsewhere', 'main'] });
    commit({ root, version: '0.4.9-5', message: 'elsewhere' });
    git({ cwd: root, args: ['tag', '-a', 'kernel-v0.4.9-5', '-m', 'x'] });
    git({ cwd: root, args: ['checkout', '-q', 'develop'] });

    expect(check({ cwd: root, tag: 'kernel-v0.4.9-5' }).problems.join('\n')).toContain(
      'not in the history of develop',
    );
  });

  test('a main that holds commits the tag lacks is refused, with the way out', () => {
    const root = fixture();

    git({ cwd: root, args: ['checkout', '-q', 'main'] });
    commit({ root, version: '0.4.8', file: 'hotfix.txt', message: 'a commit made on main only' });
    git({ cwd: root, args: ['checkout', '-q', 'develop'] });

    expect(check({ cwd: root, tag: 'kernel-v0.4.9-1' }).problems.join('\n')).toContain(
      'merge main back into develop first',
    );
  });
});

describe('ReleaseSyncPr: the branch, the title and the body', () => {
  test('the branch is sync/<tag>, so it is cut from the tag and not named develop', () => {
    expect(ReleaseSyncPr.branchOf({ tag: 'kernel-v0.4.9-1' })).toBe('sync/kernel-v0.4.9-1');
  });

  test('the body names the tag and its short commit and lists the commits it brings', () => {
    const body = ReleaseSyncPr.bodyOf({
      tag: 'kernel-v0.4.9-1',
      version: '0.4.9-1',
      commit: 'abcdef0123456789',
      subjects: ['[#11] fix(b): second change'],
    });

    expect(ReleaseSyncPr.titleOf({ version: '0.4.9-1' })).toBe('Sync main: prerelease 0.4.9-1');
    expect(body).toContain('`kernel-v0.4.9-1` (abcdef0)');
    expect(body).toContain('Brings 1 commit:');
    expect(body).toContain('```text\n[#11] fix(b): second change\n```');
  });
});

describe('ReleaseSyncPr.verify', () => {
  test('after the merge the tree of main is the tree of the tag', () => {
    const root = fixture();

    git({ cwd: root, args: ['checkout', '-q', 'main'] });
    git({ cwd: root, args: ['merge', '-q', '--no-ff', '-m', 'Sync', 'kernel-v0.4.9-1'] });

    expect(ReleaseSyncPr.verify({ cwd: root, tag: 'kernel-v0.4.9-1', main: 'main' })).toEqual([]);
  });

  test('a main that took develop past the tag instead has another tree, and is named', () => {
    const root = fixture();

    git({ cwd: root, args: ['checkout', '-q', 'main'] });
    git({ cwd: root, args: ['merge', '-q', '--no-ff', '-m', 'Sync', 'develop'] });

    expect(ReleaseSyncPr.verify({ cwd: root, tag: 'kernel-v0.4.9-1', main: 'main' })[0]).toContain(
      'is not the tree',
    );
  });
});

describe('ReleaseSyncPr.check: only a tag will do', () => {
  test('a branch name or a commit is refused as the tag, even when it satisfies every other rule', () => {
    const root = fixture();
    const commitId = git({ cwd: root, args: ['rev-parse', 'kernel-v0.4.9-1^{commit}'] });

    expect(check({ cwd: root, tag: 'develop' }).problems[0]).toContain('is not a tag here');
    expect(check({ cwd: root, tag: commitId }).problems[0]).toContain('is not a tag here');
  });
});

describe('ReleaseSyncPr.bodyOf', () => {
  test('a subject cannot ping anyone, close an issue or break out of its fence', () => {
    const body = ReleaseSyncPr.bodyOf({
      tag: 'kernel-v0.4.9-1',
      version: '0.4.9-1',
      commit: 'abcdef0123456789',
      subjects: ['fixes #9 and thanks @someone', 'closes```'],
    });

    expect(body).toContain("```text\nfixes #9 and thanks @someone\ncloses'''\n```");
  });
});

describe('ReleaseSyncPr.main', () => {
  /** The fixture with the remote-tracking refs the script reads, as a clone would have them. */
  const cloned = (): string => {
    const root = fixture();

    git({ cwd: root, args: ['update-ref', 'refs/remotes/origin/main', 'main'] });
    git({ cwd: root, args: ['update-ref', 'refs/remotes/origin/develop', 'develop'] });

    return root;
  };

  test('open --dry-run prints the branch, the title and the body, and pushes and opens nothing', () => {
    const root = cloned();

    expect(
      ReleaseSyncPr.main({
        args: ['open', '--tag', 'kernel-v0.4.9-1', '--dry-run'],
        env: {},
        cwd: root,
      }),
    ).toBe(0);
    expect(git({ cwd: root, args: ['branch', '--list', 'sync/*'] })).toBe('');
  });

  test('open refuses a tag that is not a prerelease, and a missing --tag or an unknown command exit 2', () => {
    const root = cloned();

    git({ cwd: root, args: ['tag', '-a', 'kernel-v0.4.8', '-m', 'stable', 'main'] });

    expect(
      ReleaseSyncPr.main({
        args: ['open', '--tag', 'kernel-v0.4.8', '--dry-run'],
        env: {},
        cwd: root,
      }),
    ).toBe(1);
    expect(ReleaseSyncPr.main({ args: ['open'], env: {}, cwd: root })).toBe(2);
    expect(ReleaseSyncPr.main({ args: ['merge', '--tag', 'x'], env: {}, cwd: root })).toBe(2);
  });

  test('verify exits 0 when the tree of main is the tree of the tag, and 1 when it is not', () => {
    const root = cloned();

    expect(
      ReleaseSyncPr.main({ args: ['verify', '--tag', 'kernel-v0.4.9-1'], env: {}, cwd: root }),
    ).toBe(1);

    git({ cwd: root, args: ['checkout', '-q', 'main'] });
    git({ cwd: root, args: ['merge', '-q', '--no-ff', '-m', 'Sync', 'kernel-v0.4.9-1'] });
    git({ cwd: root, args: ['update-ref', 'refs/remotes/origin/main', 'main'] });

    expect(
      ReleaseSyncPr.main({ args: ['verify', '--tag', 'kernel-v0.4.9-1'], env: {}, cwd: root }),
    ).toBe(0);
  });
});

describe('ReleaseSyncPr.versionFileOf (IGNIS: a tag per package)', () => {
  test('names the package.json of the package a tag is of', () => {
    expect(ReleaseSyncPr.versionFileOf({ tag: 'kernel-v0.4.9-1' })).toBe(
      'packages/kernel/package.json',
    );
    expect(ReleaseSyncPr.versionFileOf({ tag: 'core-server-v0.4.9-1' })).toBe(
      'packages/core-server/package.json',
    );
    expect(ReleaseSyncPr.versionFileOf({ tag: 'dev-configs-v0.4.9' })).toBe(
      'packages/dev-configs/package.json',
    );
  });

  test('is undefined for a name that is not <folder>-v<version> of a known package', () => {
    expect(ReleaseSyncPr.versionFileOf({ tag: 'vulcan-v0.4.9-1' })).toBeUndefined();
    expect(ReleaseSyncPr.versionFileOf({ tag: 'kernel0.4.9' })).toBeUndefined();
    expect(ReleaseSyncPr.versionFileOf({ tag: 'atlas-index' })).toBeUndefined();
  });

  test('check refuses a tag that is not the tag of a package, with a reason', () => {
    const root = fixture();

    git({ cwd: root, args: ['tag', '-a', 'atlas-index', '-m', 'not a release', 'develop'] });

    const checked = check({ cwd: root, tag: 'atlas-index' });

    expect(checked.problems).toHaveLength(1);
    expect(checked.problems[0]).toContain('not the tag of a package');
  });
});
