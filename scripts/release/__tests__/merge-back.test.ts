import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MergeBackConstants, ReleaseMergeBack } from '../merge-back';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const scratch = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'merge-back-test-'));

  roots.push(root);

  return root;
};

const manifest = (opts: { name: string; version: string; extra?: string }): string =>
  `${JSON.stringify({ name: opts.name, version: opts.version, ...(opts.extra === undefined ? {} : { description: opts.extra }) }, null, 2)}\n`;

const run = (opts: { cwd: string; args: string[] }): string =>
  ReleaseMergeBack.mustGit({
    cwd: opts.cwd,
    args: [...MergeBackConstants.IDENTITY, ...opts.args],
  });

const write = (opts: { root: string; path: string; text: string }): void => {
  mkdirSync(dirname(join(opts.root, opts.path)), { recursive: true });
  writeFileSync(join(opts.root, opts.path), opts.text);
};

/** Every package of the fixture workspace at `version`, the lockfile regenerated, committed. */
const release = (opts: { root: string; version: string; message: string }): void => {
  for (const name of ['a', 'b']) {
    write({
      root: opts.root,
      path: `packages/${name}/package.json`,
      text: JSON.stringify(
        {
          name: `@fixture/${name}`,
          version: opts.version,
          ...(name === 'b' ? { dependencies: { '@fixture/a': 'workspace:*' } } : {}),
        },
        null,
        2,
      ).concat('\n'),
    });
  }

  const install = Bun.spawnSync(['bun', 'install', '--lockfile-only'], {
    cwd: opts.root,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (install.exitCode !== 0) {
    throw new Error(`bun install --lockfile-only: ${install.stderr.toString()}`);
  }

  run({ cwd: opts.root, args: ['add', '-A'] });
  run({ cwd: opts.root, args: ['commit', '-q', '-m', opts.message] });
};

/**
 * A workspace right after a Sync: `main` and `develop` at 0.4.9-2. `develop` then publishes `developVersion`
 * (a prerelease, or a later line), the way a stable run meets it.
 */
const fixture = (opts: { developVersion: string }): string => {
  const root = scratch();

  run({ cwd: root, args: ['init', '-q', '-b', 'main'] });
  write({
    root,
    path: 'package.json',
    text: `${JSON.stringify({ name: 'fixture', private: true, workspaces: ['packages/*'] }, null, 2)}\n`,
  });
  write({ root, path: 'src/shared.ts', text: 'export const shared = 1;\n' });
  release({ root, version: '0.4.9-2', message: 'sync' });
  run({ cwd: root, args: ['branch', 'develop'] });
  run({ cwd: root, args: ['checkout', '-q', 'develop'] });
  release({ root, version: opts.developVersion, message: 'develop publishes' });
  run({ cwd: root, args: ['checkout', '-q', 'main'] });

  return root;
};

const versionIn = (opts: { root: string; file: string }): string | undefined =>
  ReleaseMergeBack.versionOf({ text: readFileSync(join(opts.root, opts.file), 'utf8') });

describe('ReleaseMergeBack.resolveVersionConflict', () => {
  const resolve = (opts: { base: string; ours: string; theirs: string }) =>
    ReleaseMergeBack.resolveVersionConflict({ ...opts, scratchRoot: scratch() });

  test('a stable beats the prerelease it came from, and a later line beats a stable', () => {
    const base = manifest({ name: 'x', version: '0.4.9-2' });

    expect(
      ReleaseMergeBack.versionOf({
        text:
          resolve({
            base,
            ours: manifest({ name: 'x', version: '0.4.9-3' }),
            theirs: manifest({ name: 'x', version: '0.4.9' }),
          }).text ?? '',
      }),
    ).toBe('0.4.9');
    expect(
      ReleaseMergeBack.versionOf({
        text:
          resolve({
            base,
            ours: manifest({ name: 'x', version: '0.4.10-0' }),
            theirs: manifest({ name: 'x', version: '0.4.9' }),
          }).text ?? '',
      }),
    ).toBe('0.4.10-0');
  });

  test('keeps a change another line made on one side', () => {
    const resolved = resolve({
      base: manifest({ name: 'x', version: '0.4.9-2' }),
      ours: manifest({ name: 'x', version: '0.4.9-3', extra: 'kept' }),
      theirs: manifest({ name: 'x', version: '0.4.9' }),
    });

    expect(resolved.text).toContain('"description": "kept"');
    expect(resolved.text).toContain('"version": "0.4.9"');
  });

  test('stops when another line conflicts too', () => {
    const resolved = resolve({
      base: manifest({ name: 'x', version: '0.4.9-2', extra: 'base' }),
      ours: manifest({ name: 'x', version: '0.4.9-3', extra: 'ours' }),
      theirs: manifest({ name: 'x', version: '0.4.9', extra: 'theirs' }),
    });

    expect(resolved.text).toBeUndefined();
    expect(resolved.problem).toContain('other lines conflict');
  });

  test('stops on a file with no version line in the expected format', () => {
    const resolved = resolve({ base: '{}\n', ours: '{}\n', theirs: '{}\n' });

    expect(resolved.text).toBeUndefined();
    expect(resolved.problem).toContain('no top-level version line');
  });
});

describe('ReleaseMergeBack.lockProblems', () => {
  const lock = (version: string, extra = 'a'): string =>
    [
      '{',
      '  "workspaces": {',
      `    "packages/a": { "name": "a",`,
      `      "version": "${version}",`,
      `      "x": "${extra}",`,
      '    },',
      '  },',
      '}',
    ].join('\n');

  test('workspace version lines may change, nothing else', () => {
    expect(
      ReleaseMergeBack.lockProblems({ before: lock('0.4.9-3'), after: lock('0.4.9') }),
    ).toEqual([]);
    expect(
      ReleaseMergeBack.lockProblems({ before: lock('0.4.9-3'), after: lock('0.4.9', 'b') }),
    ).toHaveLength(1);
    expect(
      ReleaseMergeBack.lockProblems({ before: lock('0.4.9-3'), after: `${lock('0.4.9')}\nmore` }),
    ).toHaveLength(1);
  });
});

describe('ReleaseMergeBack.trial', () => {
  const trial = (opts: { root: string; version: string }) =>
    ReleaseMergeBack.trial({
      cwd: opts.root,
      version: opts.version,
      main: 'main',
      develop: 'develop',
      scratchRoot: scratch(),
    });

  test('goes through when the only conflicts are versions, and leaves every branch and worktree as it was', () => {
    const root = fixture({ developVersion: '0.4.9-3' });
    const before = ['main', 'develop'].map((ref) => run({ cwd: root, args: ['rev-parse', ref] }));
    const result = trial({ root, version: '0.4.9' });

    expect(result.problems).toEqual([]);
    expect(result.resolved.sort()).toEqual(['packages/a/package.json', 'packages/b/package.json']);
    expect(result.lockRegenerated).toBe(true);
    expect(result.developHead).toBe(before[1]);
    expect(['main', 'develop'].map((ref) => run({ cwd: root, args: ['rev-parse', ref] }))).toEqual(
      before,
    );
    expect(run({ cwd: root, args: ['worktree', 'list'] }).split('\n')).toHaveLength(1);
    expect(run({ cwd: root, args: ['status', '--porcelain'] })).toBe('');
  });

  test('stops, with the reason, when a conflict is more than a version', () => {
    const root = fixture({ developVersion: '0.4.9-3' });

    run({ cwd: root, args: ['checkout', '-q', 'develop'] });
    write({ root, path: 'src/shared.ts', text: 'export const shared = 2;\n' });
    run({ cwd: root, args: ['commit', '-q', '-am', 'develop edits shared'] });
    run({ cwd: root, args: ['checkout', '-q', 'main'] });
    write({ root, path: 'src/shared.ts', text: 'export const shared = 3;\n' });
    run({ cwd: root, args: ['commit', '-q', '-am', 'main edits shared'] });

    const result = trial({ root, version: '0.4.9' });

    expect(result.problems.join('\n')).toContain('src/shared.ts');
  });
});

describe('ReleaseMergeBack.trial: packages that release apart', () => {
  test('only the packages named in versions get a release commit, each at its own version', () => {
    const root = fixture({ developVersion: '0.4.9-3' });
    const result = ReleaseMergeBack.trial({
      cwd: root,
      versions: { a: '0.4.9' },
      main: 'main',
      develop: 'develop',
      scratchRoot: scratch(),
    });

    expect(result.problems).toEqual([]);
    expect(result.resolved).toEqual(['packages/a/package.json']);
  });

  test('a directory that is not under packages/ is named, and nothing is merged', () => {
    const root = fixture({ developVersion: '0.4.9-3' });
    const result = ReleaseMergeBack.trial({
      cwd: root,
      versions: { a: '0.4.9', nope: '1.0.0' },
      main: 'main',
      develop: 'develop',
      scratchRoot: scratch(),
    });

    expect(result.problems.join('\n')).toContain('nope');
    expect(result.resolved).toEqual([]);
  });

  test('lock keep leaves bun.lock out of the release commit, so the merge needs no regeneration', () => {
    const root = fixture({ developVersion: '0.4.9-3' });
    const result = ReleaseMergeBack.trial({
      cwd: root,
      version: '0.4.9',
      lock: 'keep',
      main: 'main',
      develop: 'develop',
      scratchRoot: scratch(),
    });

    expect(result.problems).toEqual([]);
    expect(result.lockRegenerated).toBe(false);
  });

  test('without a version or versions it refuses to guess', () => {
    expect(() =>
      ReleaseMergeBack.trial({
        cwd: scratch(),
        main: 'main',
        develop: 'develop',
        scratchRoot: scratch(),
      }),
    ).toThrow('version or versions');
  });
});

describe('ReleaseMergeBack.mergeInto', () => {
  /** `release` is `main` plus the release commit at `version`; the checkout is on `develop`. */
  const prepared = (opts: { developVersion: string; version: string }): string => {
    const root = fixture({ developVersion: opts.developVersion });

    run({ cwd: root, args: ['checkout', '-q', '-b', 'release', 'main'] });
    release({ root, version: opts.version, message: 'chore(release): v' });
    run({ cwd: root, args: ['checkout', '-q', 'develop'] });

    return root;
  };

  test('commits a merge in which the stable wins on every package and the lockfile follows', () => {
    const root = prepared({ developVersion: '0.4.9-3', version: '0.4.9' });
    const result = ReleaseMergeBack.mergeInto({
      cwd: root,
      from: 'release',
      scratchRoot: scratch(),
      commit: { message: 'Merge main into develop' },
    });

    expect(result.problems).toEqual([]);
    expect(result.head).toBe(run({ cwd: root, args: ['rev-parse', 'HEAD'] }));
    expect(versionIn({ root, file: 'packages/a/package.json' })).toBe('0.4.9');
    expect(versionIn({ root, file: 'packages/b/package.json' })).toBe('0.4.9');
    expect(readFileSync(join(root, 'bun.lock'), 'utf8')).toContain('"version": "0.4.9"');
    expect(run({ cwd: root, args: ['log', '-1', '--format=%P'] }).split(' ')).toHaveLength(2);
  });

  test('keeps a later line the develop side already moved to', () => {
    const root = prepared({ developVersion: '0.4.10-0', version: '0.4.9' });
    const result = ReleaseMergeBack.mergeInto({
      cwd: root,
      from: 'release',
      scratchRoot: scratch(),
      commit: { message: 'Merge main into develop' },
    });

    expect(result.problems).toEqual([]);
    expect(versionIn({ root, file: 'packages/a/package.json' })).toBe('0.4.10-0');
    expect(readFileSync(join(root, 'bun.lock'), 'utf8')).toContain('"version": "0.4.10-0"');
  });

  test('puts the checkout back as it was when it stops', () => {
    const root = prepared({ developVersion: '0.4.9-3', version: '0.4.9' });

    write({ root, path: 'src/shared.ts', text: 'export const shared = 2;\n' });
    run({ cwd: root, args: ['commit', '-q', '-am', 'develop edits shared'] });
    run({ cwd: root, args: ['checkout', '-q', 'release'] });
    write({ root, path: 'src/shared.ts', text: 'export const shared = 3;\n' });
    run({ cwd: root, args: ['commit', '-q', '-am', 'main edits shared'] });
    run({ cwd: root, args: ['checkout', '-q', 'develop'] });

    const head = run({ cwd: root, args: ['rev-parse', 'HEAD'] });
    const result = ReleaseMergeBack.mergeInto({
      cwd: root,
      from: 'release',
      scratchRoot: scratch(),
      commit: { message: 'Merge main into develop' },
    });

    expect(result.problems.join('\n')).toContain('src/shared.ts');
    expect(result.head).toBeUndefined();
    expect(run({ cwd: root, args: ['rev-parse', 'HEAD'] })).toBe(head);
    expect(run({ cwd: root, args: ['status', '--porcelain'] })).toBe('');
    expect(existsSync(join(root, '.git', 'MERGE_HEAD'))).toBe(false);
  });

  test('a merge of what is already in develop commits nothing and still reports a head', () => {
    const root = prepared({ developVersion: '0.4.9-3', version: '0.4.9' });
    const head = run({ cwd: root, args: ['rev-parse', 'HEAD'] });
    const result = ReleaseMergeBack.mergeInto({
      cwd: root,
      from: 'develop',
      scratchRoot: scratch(),
      commit: { message: 'Merge main into develop' },
    });

    expect(result.problems).toEqual([]);
    expect(result.head).toBe(head);
  });
});

describe('ReleaseMergeBack.flagValue', () => {
  test('a value is the next argument, and a flag followed by a flag has none', () => {
    expect(ReleaseMergeBack.flagValue({ args: ['--bump', 'patch'], flag: '--bump' })).toBe('patch');
    expect(
      ReleaseMergeBack.flagValue({ args: ['--bump', '--ref', 'x'], flag: '--bump' }),
    ).toBeUndefined();
    expect(ReleaseMergeBack.flagValue({ args: ['--bump'], flag: '--bump' })).toBeUndefined();
    expect(ReleaseMergeBack.flagValue({ args: [], flag: '--bump' })).toBeUndefined();
  });
});

describe('ReleaseMergeBack.trial: a package.json it cannot read', () => {
  test('one indented with tabs stops the trial before the approval, not the merge after the publish', () => {
    const root = fixture({ developVersion: '0.4.9-3' });

    write({
      root,
      path: 'packages/a/package.json',
      text: `${JSON.stringify({ name: '@fixture/a', version: '0.4.9-2' }, null, '\t')}\n`,
    });
    run({ cwd: root, args: ['commit', '-q', '-am', 'main reindents a'] });

    const result = ReleaseMergeBack.trial({
      cwd: root,
      version: '0.4.9',
      main: 'main',
      develop: 'develop',
      scratchRoot: scratch(),
    });

    expect(result.problems.join('\n')).toContain('packages/a/package.json');
    expect(result.problems.join('\n')).toContain('two spaces');
  });
});

describe('ReleaseMergeBack.main', () => {
  const trialArgs = ['trial', '--main', 'main', '--develop', 'develop'];
  const main = (opts: { args: string[]; cwd: string; output?: string }) =>
    ReleaseMergeBack.main({
      args: opts.args,
      cwd: opts.cwd,
      env: {
        RUNNER_TEMP: scratch(),
        ...(opts.output === undefined ? {} : { GITHUB_OUTPUT: opts.output }),
      },
    });

  test('an unknown command and a trial without exactly one of version and versions exit 2', () => {
    const root = fixture({ developVersion: '0.4.9-3' });

    expect(main({ args: [], cwd: root })).toBe(2);
    expect(main({ args: trialArgs, cwd: root })).toBe(2);
    expect(
      main({ args: [...trialArgs, '--version', '0.4.9', '--versions', 'a=0.4.9'], cwd: root }),
    ).toBe(2);
  });

  test('a malformed --versions or an unknown --lock exits 2', () => {
    const root = fixture({ developVersion: '0.4.9-3' });

    expect(main({ args: [...trialArgs, '--versions', 'a'], cwd: root })).toBe(2);
    expect(main({ args: [...trialArgs, '--version', '0.4.9', '--lock', 'never'], cwd: root })).toBe(
      2,
    );
  });

  test('a trial that goes through exits 0 and writes the head of develop it read', () => {
    const root = fixture({ developVersion: '0.4.9-3' });
    const output = join(scratch(), 'github-output');

    writeFileSync(output, '');

    expect(main({ args: [...trialArgs, '--version', '0.4.9'], cwd: root, output })).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(
      `develop_sha=${run({ cwd: root, args: ['rev-parse', 'develop'] })}\n`,
    );
  });

  test('a trial that stops exits 1', () => {
    const root = fixture({ developVersion: '0.4.9-3' });

    run({ cwd: root, args: ['checkout', '-q', 'develop'] });
    write({ root, path: 'src/shared.ts', text: 'export const shared = 2;\n' });
    run({ cwd: root, args: ['commit', '-q', '-am', 'develop edits shared'] });
    run({ cwd: root, args: ['checkout', '-q', 'main'] });
    write({ root, path: 'src/shared.ts', text: 'export const shared = 3;\n' });
    run({ cwd: root, args: ['commit', '-q', '-am', 'main edits shared'] });

    expect(main({ args: [...trialArgs, '--version', '0.4.9'], cwd: root })).toBe(1);
  });

  test('apply needs --from, and merges into the worktree --repo names, leaving the caller untouched', () => {
    const root = fixture({ developVersion: '0.4.9-3' });

    run({ cwd: root, args: ['checkout', '-q', '-b', 'release', 'main'] });
    release({ root, version: '0.4.9', message: 'chore(release): v' });

    const worktree = join(scratch(), 'develop-merge');

    run({ cwd: root, args: ['worktree', 'add', '--detach', worktree, 'develop'] });

    const before = run({ cwd: root, args: ['rev-parse', 'HEAD'] });

    expect(main({ args: ['apply'], cwd: root })).toBe(2);
    expect(main({ args: ['apply', '--repo', worktree, '--from', 'release'], cwd: root })).toBe(0);
    expect(run({ cwd: root, args: ['rev-parse', 'HEAD'] })).toBe(before);
    expect(versionIn({ root: worktree, file: 'packages/a/package.json' })).toBe('0.4.9');
    expect(run({ cwd: worktree, args: ['log', '-1', '--format=%P'] }).split(' ')).toHaveLength(2);
  });
});
