import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ReleaseChangelog } from '../release-changelog';
import { ReleaseTargets } from '../release-track';
import { MergeBackConstants, ReleaseMergeBack } from '../merge-back';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const LOG = "---\ntitle: 0.4.8\nversion: 0.4.8\npackages: ['@x/core']\n---\nThe line.\n";
const RELEASED_LOG = LOG.replace('---\nThe', 'released: 2026-11-20\n---\nThe');

const git = (opts: { cwd: string; args: string[] }): string =>
  ReleaseMergeBack.mustGit({ cwd: opts.cwd, args: [...MergeBackConstants.IDENTITY, ...opts.args] });

/** A repository with the manifest of a release, the given files and the given tags (on one commit). */
const project = (opts: {
  migrationFrom?: string;
  manifest?: boolean;
  files?: Record<string, string>;
  tags?: string[];
}): string => {
  const root = mkdtempSync(join(tmpdir(), 'release-changelog-'));

  roots.push(root);
  git({ cwd: root, args: ['init', '-q', '-b', 'main'] });
  git({ cwd: root, args: ['config', 'maintenance.auto', 'false'] });

  const files: Record<string, string> = {
    ...(opts.manifest === false
      ? {}
      : {
          '.agents/vulcan.manifest.json': JSON.stringify({
            release: { tagPattern: '<dir>-v<version>' },
            knowledge: {
              changelogs: 'docs/changelogs',
              ...(opts.migrationFrom === undefined ? {} : { migrationFrom: opts.migrationFrom }),
            },
            packages: [
              { name: '@x/kernel', dir: 'kernel' },
              { name: '@x/core', dir: 'core-server' },
            ],
          }),
        }),
    ...opts.files,
    'README.md': 'x\n',
  };

  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }

  git({ cwd: root, args: ['add', '-A'] });
  git({ cwd: root, args: ['commit', '-q', '-m', 'first'] });

  for (const name of opts.tags ?? []) {
    git({ cwd: root, args: ['tag', '-a', name, '-m', name] });
  }

  return root;
};

describe('ReleaseChangelog.problems', () => {
  test('a stable whose version has its folder, not yet released, has no problem', () => {
    const root = project({
      migrationFrom: '0.4.5',
      files: { 'docs/changelogs/0.4.8/log.md': LOG },
    });

    expect(ReleaseChangelog.problems({ cwd: root, version: '0.4.8', healing: false })).toEqual([]);
  });

  test('a stable with no folder is refused, and the message says where to write it', () => {
    const root = project({ migrationFrom: '0.4.5' });
    const [problem, ...others] = ReleaseChangelog.problems({
      cwd: root,
      version: '0.4.8',
      healing: false,
    });

    expect(others).toEqual([]);
    expect(problem).toBe(
      'the stable 0.4.8 has no version folder: write docs/changelogs/0.4.8/log.md before releasing it',
    );
  });

  test('a folder that already says released: is refused, because a stable is released once', () => {
    const root = project({
      migrationFrom: '0.4.5',
      files: { 'docs/changelogs/0.4.8/log.md': RELEASED_LOG },
    });

    expect(ReleaseChangelog.problems({ cwd: root, version: '0.4.8', healing: false })).toEqual([
      'docs/changelogs/0.4.8/log.md already says released: 2026-11-20; a released folder is frozen',
    ]);
  });

  test('a run that continues one which already made the release commit accepts the date, and still needs the folder', () => {
    const released = project({
      migrationFrom: '0.4.5',
      files: { 'docs/changelogs/0.4.8/log.md': RELEASED_LOG },
    });
    const missing = project({ migrationFrom: '0.4.5' });

    expect(ReleaseChangelog.problems({ cwd: released, version: '0.4.8', healing: true })).toEqual(
      [],
    );
    expect(
      ReleaseChangelog.problems({ cwd: missing, version: '0.4.8', healing: true }),
    ).toHaveLength(1);
  });

  test('a body line that starts with released: is not the stamp: only the frontmatter is read', () => {
    const root = project({
      migrationFrom: '0.4.5',
      files: { 'docs/changelogs/0.4.8/log.md': `${LOG}released: here\n` },
    });

    expect(ReleaseChangelog.problems({ cwd: root, version: '0.4.8', healing: false })).toEqual([]);
  });

  test('an empty released: line is refused like the real stamp refuses it, and does not read the next line as its date', () => {
    const root = project({
      migrationFrom: '0.4.5',
      files: {
        'docs/changelogs/0.4.8/log.md': LOG.replace('---\nThe', 'released:\nafter: x\n---\nThe'),
      },
    });

    const problems = (healing: boolean) =>
      ReleaseChangelog.problems({ cwd: root, version: '0.4.8', healing, date: '2026-11-20' });

    expect(problems(false)).toEqual([
      'docs/changelogs/0.4.8/log.md already says released: ; a released folder is frozen',
    ]);
    expect(problems(true)).toEqual([]);
  });

  test('a folder dated today is refused too, unless the run continues one that dated it', () => {
    const root = project({
      migrationFrom: '0.4.5',
      files: { 'docs/changelogs/0.4.8/log.md': RELEASED_LOG },
    });

    expect(
      ReleaseChangelog.problems({
        cwd: root,
        version: '0.4.8',
        healing: false,
        date: '2026-11-20',
      }),
    ).toEqual([
      'docs/changelogs/0.4.8/log.md already says released: 2026-11-20; a released folder is frozen',
    ]);
    expect(
      ReleaseChangelog.problems({ cwd: root, version: '0.4.8', healing: true, date: '2026-11-20' }),
    ).toEqual([]);
  });

  test('a log.md with no frontmatter is refused in the plan, before the stamp would fail after the publish', () => {
    const root = project({
      migrationFrom: '0.4.5',
      files: { 'docs/changelogs/0.4.8/log.md': 'No frontmatter.\n' },
    });

    for (const healing of [false, true]) {
      expect(ReleaseChangelog.problems({ cwd: root, version: '0.4.8', healing })).toEqual([
        'docs/changelogs/0.4.8/log.md has no frontmatter to write released: into',
      ]);
    }
  });

  test('a project that has not adopted the folders, or has no manifest, needs nothing', () => {
    expect(
      ReleaseChangelog.problems({ cwd: project({}), version: '0.4.8', healing: false }),
    ).toEqual([]);
    expect(
      ReleaseChangelog.problems({
        cwd: project({ migrationFrom: '2026-11-01' }),
        version: '0.4.8',
        healing: false,
      }),
    ).toEqual([]);
    expect(
      ReleaseChangelog.problems({
        cwd: project({ manifest: false }),
        version: '0.4.8',
        healing: false,
      }),
    ).toEqual([]);
  });
});

describe('ReleaseChangelog.base', () => {
  const TAGS = [
    'core-server-v0.4.6',
    'core-server-v0.4.7',
    'core-server-v0.4.8-0',
    'core-server-v0.4.8-1',
    'kernel-v0.4.8',
    'core-server-v0.4.10',
  ];

  test('is the highest stable tag of the package below the version, never a prerelease or another package', () => {
    const root = project({ tags: TAGS });

    expect(ReleaseChangelog.base({ cwd: root, dir: 'core-server', version: '0.4.8' })).toBe(
      'core-server-v0.4.7',
    );
    expect(ReleaseChangelog.base({ cwd: root, dir: 'core-server', version: '0.4.9' })).toBe(
      'core-server-v0.4.7',
    );
    expect(ReleaseChangelog.base({ cwd: root, dir: 'core-server', version: '0.4.11' })).toBe(
      'core-server-v0.4.10',
    );
    expect(ReleaseChangelog.base({ cwd: root, dir: 'kernel', version: '0.4.9' })).toBe(
      'kernel-v0.4.8',
    );
  });

  test('is empty when there is no stable tag below the version, and when the project has no manifest', () => {
    expect(
      ReleaseChangelog.base({ cwd: project({ tags: TAGS }), dir: 'core-server', version: '0.4.6' }),
    ).toBe('');
    expect(
      ReleaseChangelog.base({
        cwd: project({ manifest: false }),
        dir: 'core-server',
        version: '0.4.8',
      }),
    ).toBe('');
  });
});

describe('ReleaseChangelog.ofPlan', () => {
  const ENTRIES = [
    { name: 'kernel', from: '0.4.8-2' },
    { name: 'core-server', from: '0.4.8-3' },
  ];
  const versions = new Map([
    ['kernel', '0.4.8-2'],
    ['core-server', '0.4.8-3'],
  ]);
  const plan = (mode: 'patch' | 'prerelease') =>
    ReleaseTargets.plan({
      entries: ENTRIES,
      mode,
      ref: mode === 'patch' ? 'refs/heads/main' : 'refs/heads/develop',
      versions,
    });

  test('a prerelease needs no folder and has no base', () => {
    const root = project({ migrationFrom: '0.4.5', tags: ['core-server-v0.4.7'] });

    expect(ReleaseChangelog.ofPlan({ cwd: root, plan: plan('prerelease'), versions })).toEqual({
      problems: [],
      base: '',
    });
  });

  test('a stable without core-server needs no folder, stamps nothing and has no base: the folders are core-server`s', () => {
    const root = project({ migrationFrom: '0.4.5', tags: ['core-server-v0.4.7'] });
    const kernel = ReleaseTargets.plan({
      entries: [{ name: 'kernel', from: '0.4.9-2' }],
      mode: 'patch',
      ref: 'refs/heads/main',
      versions: new Map([['kernel', '0.4.9-2']]),
    });

    expect(
      ReleaseChangelog.ofPlan({
        cwd: root,
        plan: kernel,
        versions: new Map([['kernel', '0.4.9-2']]),
      }),
    ).toEqual({ problems: [], base: '' });
  });

  test('a stable reads the folder of core-server, and its base is its previous stable', () => {
    const root = project({
      migrationFrom: '0.4.5',
      files: { 'docs/changelogs/0.4.8/log.md': LOG },
      tags: ['core-server-v0.4.7', 'kernel-v0.4.7', 'core-server-v0.4.8-0'],
    });

    expect(ReleaseChangelog.ofPlan({ cwd: root, plan: plan('patch'), versions })).toEqual({
      problems: [],
      base: 'core-server-v0.4.7',
    });
  });

  test('a stable with no folder is refused in the plan, with the version of core-server, not the first', () => {
    const root = project({
      migrationFrom: '0.4.5',
      files: { 'docs/changelogs/0.4.9/log.md': LOG },
    });
    const [problem] = ReleaseChangelog.ofPlan({
      cwd: root,
      plan: plan('patch'),
      versions,
    }).problems;

    expect(problem).toContain('the stable 0.4.8 has no version folder');
  });

  test('a stable whose folder is released is refused, unless core-server is already at its target on the commit', () => {
    const root = project({
      migrationFrom: '0.4.5',
      files: { 'docs/changelogs/0.4.8/log.md': RELEASED_LOG },
    });
    const healing = new Map([
      ['kernel', '0.4.8'],
      ['core-server', '0.4.8'],
    ]);

    expect(ReleaseChangelog.ofPlan({ cwd: root, plan: plan('patch'), versions }).problems).toEqual([
      'docs/changelogs/0.4.8/log.md already says released: 2026-11-20; a released folder is frozen',
    ]);
    expect(
      ReleaseChangelog.ofPlan({ cwd: root, plan: plan('patch'), versions: healing }).problems,
    ).toEqual([]);
  });
});

describe('release-run.ts plan, as the plan job runs it', () => {
  const SCRIPT = join(import.meta.dir, '..', 'release-run.ts');

  /** A project at the commit the plan job sees: two packages at a prerelease of 0.4.8, and the files given. */
  const planned = (opts: {
    files?: Record<string, string>;
    mode: 'patch' | 'prerelease';
    /** The versions on the commit; the plan always starts from the prereleases. */
    versions?: Record<string, string>;
  }): { status: number; stderr: string; outputs: string } => {
    const from: Record<string, string> = { kernel: '0.4.8-2', 'core-server': '0.4.8-3' };
    const versions = opts.versions ?? from;
    const files: Record<string, string> = { ...opts.files };

    for (const [dir, version] of Object.entries(versions)) {
      files[`packages/${dir}/package.json`] = `${JSON.stringify({ name: `@x/${dir}`, version })}\n`;
    }

    const root = project({
      migrationFrom: '0.4.5',
      files,
      tags: ['core-server-v0.4.7', 'core-server-v0.4.8-0'],
    });
    const output = join(root, 'github-output');

    writeFileSync(output, '');

    const child = Bun.spawnSync(['bun', SCRIPT, 'plan'], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        PLAN: Object.entries(from)
          .map(([dir, version]) => `${dir}@${version}`)
          .join(','),
        BUILD_MODE: opts.mode,
        GITHUB_REF: opts.mode === 'patch' ? 'refs/heads/main' : 'refs/heads/develop',
        GITHUB_OUTPUT: output,
      },
    });

    return {
      status: child.exitCode,
      stderr: child.stderr.toString(),
      outputs: readFileSync(output, 'utf8'),
    };
  };

  test('a stable with its folder outputs changelog_base, the previous stable tag of core-server', () => {
    const result = planned({ mode: 'patch', files: { 'docs/changelogs/0.4.8/log.md': LOG } });

    expect(result.status).toBe(0);
    expect(result.outputs).toContain('track=stable\n');
    expect(result.outputs).toContain('changelog_base=core-server-v0.4.7\n');
  });

  test('a prerelease outputs an empty changelog_base and needs no folder', () => {
    const result = planned({ mode: 'prerelease' });

    expect(result.status).toBe(0);
    expect(result.outputs).toContain('changelog_base=\n');
  });

  test('a stable with no folder is refused, and nothing is written for the other jobs', () => {
    const result = planned({ mode: 'patch' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('the plan is refused');
    expect(result.stderr).toContain('the stable 0.4.8 has no version folder');
    expect(result.outputs).toBe('');
  });

  test('a stable whose folder is already released is refused', () => {
    const result = planned({
      mode: 'patch',
      files: { 'docs/changelogs/0.4.8/log.md': RELEASED_LOG },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already says released');
  });

  test('a dispatch of the same plan after the last package was released is accepted with the date', () => {
    const result = planned({
      mode: 'patch',
      files: { 'docs/changelogs/0.4.8/log.md': RELEASED_LOG },
      versions: { kernel: '0.4.8', 'core-server': '0.4.8' },
    });

    expect(result.status).toBe(0);
  });
});
