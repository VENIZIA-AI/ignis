import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { IGithubReleaseManifest, IGithubReleaseTarget, TGh } from '../github-release';
import { GithubRelease, GithubReleaseConstants } from '../github-release';
import { MergeBackConstants, ReleaseMergeBack } from '../merge-back';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const scratch = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'github-release-test-'));

  roots.push(root);

  return root;
};

const git = (opts: { cwd: string; args: string[] }): string =>
  ReleaseMergeBack.mustGit({ cwd: opts.cwd, args: [...MergeBackConstants.IDENTITY, ...opts.args] });

const MANIFEST: IGithubReleaseManifest = {
  tagPattern: '<dir>-v<version>',
  changelogs: 'docs/changelogs',
  packages: [
    { name: '@x/inversion', dir: 'inversion' },
    { name: '@x/kernel', dir: 'kernel' },
    { name: '@x/core-worker', dir: 'core-worker' },
    { name: '@x/core', dir: 'core-server' },
  ],
};

const SERVER_TEMPLATE = 'core-server-v<version>';

const entry = (opts: { title: string; body: string }): string =>
  `---\ntitle: "${opts.title}"\npackages: ['@x/core']\n---\n\n# Changelog - 2026-10-20\n\n## ${opts.title}\n\n<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Breaking" />\n\n${opts.body}\n`;

const commit = (opts: { root: string; message: string; files?: Record<string, string> }): void => {
  for (const [path, text] of Object.entries(opts.files ?? {})) {
    mkdirSync(dirname(join(opts.root, path)), { recursive: true });
    writeFileSync(join(opts.root, path), text);
  }

  git({ cwd: opts.root, args: ['add', '-A'] });
  git({ cwd: opts.root, args: ['commit', '-q', '--allow-empty', '-m', opts.message] });
};

const tag = (opts: { root: string; name: string }): void => {
  git({ cwd: opts.root, args: ['tag', '-a', opts.name, '-m', opts.name] });
};

/**
 * Two packages released together, as the loop does: the tag of `kernel` comes on a commit before the tag of
 * `core-server`, which is the last package of the plan.
 *
 *   0.4.7 (stable): one old entry.   0.4.8-0: entry b.   0.4.8-1: entry c, a commit with no issue, two release commits.
 *   0.4.8 (stable): adds nothing.    kernel-v0.4.9 is a stable of another package, above every core-server tag.
 */
const fixture = (): string => {
  const root = scratch();

  git({ cwd: root, args: ['init', '-q', '-b', 'develop'] });
  commit({
    root,
    message: '[#1] feat(a): the first',
    files: {
      '.agents/vulcan.manifest.json': `${JSON.stringify({
        release: { tagPattern: '<dir>-v<version>' },
        knowledge: { changelogs: 'docs/changelogs' },
        packages: MANIFEST.packages,
      })}\n`,
      'docs/changelogs/2026-10-01-old.md': entry({ title: 'Old change', body: 'Before 0.4.7.' }),
      'docs/changelogs/index.md': '# index\n',
    },
  });
  tag({ root, name: 'kernel-v0.4.7' });
  tag({ root, name: 'core-server-v0.4.7' });
  commit({
    root,
    message: '[#10] feat(b): second change',
    files: {
      'docs/changelogs/2026-10-20-b.md': entry({
        title: 'Change B is described',
        body: 'B body line.',
      }),
    },
  });
  tag({ root, name: 'core-server-v0.4.8-0' });
  commit({
    root,
    message: '[#11] fix(c): third change',
    files: {
      'docs/changelogs/2026-10-25-c.md': entry({ title: 'Change C', body: 'C body line.' }),
    },
  });
  commit({ root, message: 'chore: housekeeping with no issue' });
  commit({ root, message: '[#11] chore(kernel): release v0.4.8-1 [prerelease]' });
  tag({ root, name: 'kernel-v0.4.8-1' });
  commit({ root, message: '[#11] chore(core-server): release v0.4.8-1 [prerelease]' });
  tag({ root, name: 'core-server-v0.4.8-1' });
  commit({ root, message: 'chore(kernel): release v0.4.8 [patch]' });
  tag({ root, name: 'kernel-v0.4.8' });
  commit({ root, message: 'chore(core-server): release v0.4.8 [patch]' });
  tag({ root, name: 'core-server-v0.4.8' });
  tag({ root, name: 'kernel-v0.4.9' });
  tag({ root, name: 'atlas-index' });

  return root;
};

interface IStubGh {
  gh: TGh;
  calls: string[][];
  /** The notes file of the last create, read while it still existed. */
  notes: () => string;
  created: () => string[];
}

/** A stand-in for `gh`: records every call, and reads the notes file while it still exists. */
const stubGh = (opts: {
  existing?: boolean;
  createFails?: boolean;
  createStderr?: string;
}): IStubGh => {
  const calls: string[][] = [];
  let notes = '';

  return {
    calls,
    notes: () => notes,
    created: () => calls.find((call) => call[1] === 'create') ?? [],
    gh: ({ args }) => {
      calls.push(args);

      if (args[1] === 'view') {
        return { status: opts.existing === true ? 0 : 1, stdout: '', stderr: 'release not found' };
      }

      notes = readFileSync(args[args.indexOf('--notes-file') + 1], 'utf8');

      return opts.createFails === true
        ? { status: 1, stdout: '', stderr: opts.createStderr ?? 'HTTP 422: tag does not exist' }
        : { status: 0, stdout: `https://github.com/x/y/releases/tag/${args[2]}\n`, stderr: '' };
    },
  };
};

const SERVER_STABLE: IGithubReleaseTarget[] = [
  { dir: 'kernel', version: '0.4.8' },
  { dir: 'core-server', version: '0.4.8' },
];

const make = (opts: {
  root: string;
  targets: IGithubReleaseTarget[];
  kind: string;
  stub: IStubGh;
  withSubjectFallback?: boolean;
  dryRun?: boolean;
}) =>
  GithubRelease.create({
    cwd: opts.root,
    targets: opts.targets,
    kind: opts.kind,
    gh: opts.stub.gh,
    scratchRoot: scratch(),
    withSubjectFallback: opts.withSubjectFallback,
    dryRun: opts.dryRun,
  });

describe('GithubRelease.versionOfTag, tagOf and targetOfTag', () => {
  test('reads the version under the template of one package, and nothing that does not start with a digit', () => {
    const version = (tagName: string) =>
      GithubRelease.versionOfTag({ tag: tagName, template: SERVER_TEMPLATE });

    expect(version('core-server-v0.4.8-1')).toBe('0.4.8-1');
    expect(version('core-server-v0.4.7')).toBe('0.4.7');
    expect(version('kernel-v0.4.8')).toBeUndefined();
    expect(version('core-worker-v0.4.8')).toBeUndefined();
    expect(version('atlas-index')).toBeUndefined();
    expect(version('core-server-v-banner')).toBeUndefined();
  });

  test('a tag is built from the pattern and read back to its package and version', () => {
    const target = { dir: 'core-worker', version: '0.4.8-3' };
    const name = GithubRelease.tagOf({ manifest: MANIFEST, target });

    expect(name).toBe('core-worker-v0.4.8-3');
    expect(GithubRelease.targetOfTag({ tag: name, manifest: MANIFEST })).toEqual(target);
    expect(GithubRelease.targetOfTag({ tag: 'atlas-index', manifest: MANIFEST })).toBeUndefined();
    expect(GithubRelease.targetOfTag({ tag: 'atlas-v0.1.0', manifest: MANIFEST })).toBeUndefined();
  });
});

describe('GithubRelease.targetsOf', () => {
  const targetsOf = (text: string) => GithubRelease.targetsOf({ text, manifest: MANIFEST });

  test('puts the packages in release order, whatever order they are given in', () => {
    expect(targetsOf('core-server=0.4.8,inversion=0.4.7,kernel=0.4.8')).toEqual([
      { dir: 'inversion', version: '0.4.7' },
      { dir: 'kernel', version: '0.4.8' },
      { dir: 'core-server', version: '0.4.8' },
    ]);
  });

  test('refuses an empty list, a malformed entry and a package the manifest does not know', () => {
    expect(() => targetsOf('')).toThrow('names no package');
    expect(() => targetsOf('kernel')).toThrow('not <dir>=<version>');
    expect(() => targetsOf('kernel=latest')).toThrow('not <dir>=<version>');
    expect(() => targetsOf('nothing=1.0.0')).toThrow('not in');
  });
});

describe('GithubRelease.previousTag and isNewestStable', () => {
  const tags = [
    'core-server-v0.4.6',
    'core-server-v0.4.7',
    'core-server-v0.4.8-0',
    'core-server-v0.4.8-1',
    'core-server-v0.4.8',
    'kernel-v0.4.9',
    'kernel-v0.4.9-2',
    'atlas-index',
  ];
  const previous = (opts: { version: string; stableOnly: boolean }) =>
    GithubRelease.previousTag({ tags, template: SERVER_TEMPLATE, ...opts });
  const isNewest = (opts: { version: string }) =>
    GithubRelease.isNewestStable({ tags, template: SERVER_TEMPLATE, ...opts });

  test('a stable looks back to the highest stable of the same package below it', () => {
    expect(previous({ version: '0.4.8', stableOnly: true })).toBe('core-server-v0.4.7');
    expect(previous({ version: '0.4.9', stableOnly: true })).toBe('core-server-v0.4.8');
  });

  test('a prerelease looks back to the highest tag of any kind below it, and numbers compare as numbers', () => {
    expect(previous({ version: '0.4.8-1', stableOnly: false })).toBe('core-server-v0.4.8-0');
    expect(previous({ version: '0.4.8-10', stableOnly: false })).toBe('core-server-v0.4.8-1');
    expect(previous({ version: '0.4.6', stableOnly: false })).toBeUndefined();
  });

  test('a stable is the newest only when no stable tag of the same package is above it', () => {
    expect(isNewest({ version: '0.4.8' })).toBe(true);
    expect(isNewest({ version: '0.4.7' })).toBe(false);
    expect(isNewest({ version: '0.4.9' })).toBe(true);
  });

  test('the tags of another package never count: kernel-v0.4.9 does not make core-server 0.4.8 old', () => {
    expect(isNewest({ version: '0.4.8' })).toBe(true);
    expect(previous({ version: '0.4.10', stableOnly: false })).toBe('core-server-v0.4.8');
  });
});

describe('GithubRelease.stableNotes', () => {
  const notesOf = (opts: { root: string; from?: string; to: string }) =>
    GithubRelease.stableNotes({ ...opts, cwd: opts.root, folder: 'docs/changelogs' });

  test('joins the entries added since the previous stable, in date order, and skips older ones', () => {
    const notes = notesOf({
      root: fixture(),
      from: 'core-server-v0.4.7',
      to: 'core-server-v0.4.8',
    });

    expect(notes).toContain('Change C');
    expect(notes).toContain('C body line.');
    expect(notes).not.toContain('Old change');
    expect(notes).not.toContain('---');
    expect(notes).not.toContain('# Changelog - ');
    expect(notes.indexOf('B body line.')).toBeLessThan(notes.indexOf('C body line.'));
  });

  test('the badge line of an entry is dropped, one badge or several, and the heading is kept', () => {
    const notes = notesOf({
      root: fixture(),
      from: 'core-server-v0.4.7',
      to: 'core-server-v0.4.8',
    });

    expect(notes).not.toContain('Badge');
    expect(notes).toContain('## Change B is described\n\nB body line.');
    expect(
      GithubRelease.stripEntry({
        text: '## The contract\n\n<Badge type="tip" text="X" />\n\nBody.',
      }),
    ).toBe('## The contract\n\nBody.');
  });

  test('is empty when no entry was added in the range', () => {
    expect(
      notesOf({ root: fixture(), from: 'core-server-v0.4.8-1', to: 'core-server-v0.4.8' }),
    ).toBe('');
  });

  test('an entry renamed inside the range still counts, under its new name', () => {
    const root = fixture();
    const first = 'docs/changelogs/2026-10-27-d-first-name.md';

    commit({
      root,
      message: '[#13] feat(d): added',
      files: { [first]: entry({ title: 'Change D', body: 'D body.' }) },
    });
    git({ cwd: root, args: ['mv', first, 'docs/changelogs/2026-10-27-d.md'] });
    commit({ root, message: '[#13] docs(d): renamed' });

    expect(notesOf({ root, from: 'core-server-v0.4.8', to: 'HEAD' })).toContain('D body.');
  });
});

describe('GithubRelease.create', () => {
  test('a stable that is the newest is marked Latest, titled with the version of the last package, on its tag', () => {
    const stub = stubGh({});
    const outcome = make({ root: fixture(), targets: SERVER_STABLE, kind: 'stable', stub });
    const created = stub.created();

    expect(outcome.state).toBe('created');
    expect(created[2]).toBe('core-server-v0.4.8');
    expect(created).toContain('--latest');
    expect(created).not.toContain('--prerelease');
    expect(created[created.indexOf('--title') + 1]).toBe('IGNIS 0.4.8');
    expect(created).toContain('--verify-tag');
    expect(stub.notes()).toContain('B body line.');
    expect(stub.notes()).toContain('C body line.');
  });

  test('the Packages section lists every package of the run in release order, each at its own version', () => {
    const stub = stubGh({});

    make({
      root: fixture(),
      targets: [
        { dir: 'inversion', version: '0.4.7' },
        { dir: 'kernel', version: '0.4.8' },
        { dir: 'core-server', version: '0.4.8' },
      ],
      kind: 'stable',
      stub,
    });

    const lines = stub.notes().split('\n');

    expect(lines.slice(lines.indexOf('## Packages'))).toEqual([
      '## Packages',
      '',
      '- [@x/inversion@0.4.7](https://www.npmjs.com/package/@x/inversion/v/0.4.7)',
      '- [@x/kernel@0.4.8](https://www.npmjs.com/package/@x/kernel/v/0.4.8)',
      '- [@x/core@0.4.8](https://www.npmjs.com/package/@x/core/v/0.4.8)',
      '',
    ]);
  });

  test('a run without core-server is released on the tag of its last package, with that package in the title', () => {
    const root = fixture();
    const stub = stubGh({});

    // The tag of the plan's last package is the one `git log` reads: the previous stable of kernel is kernel-v0.4.7.
    const outcome = make({
      root,
      targets: [
        { dir: 'inversion', version: '0.4.8' },
        { dir: 'kernel', version: '0.4.8' },
      ],
      kind: 'stable',
      stub,
    });

    expect(outcome.state).toBe('created');
    expect(stub.created()[2]).toBe('kernel-v0.4.8');
    expect(stub.created()[stub.created().indexOf('--title') + 1]).toBe('IGNIS kernel 0.4.8');
    expect(stub.notes()).toContain('B body line.');
  });

  test('Latest belongs to core-server alone: a stable of another package is never Latest, even its own newest', () => {
    const root = fixture();
    const newest = stubGh({});
    const older = stubGh({});

    // kernel-v0.4.9 is the newest stable kernel tag; core-server-v0.4.8 is the newest of its package.
    make({ root, targets: [{ dir: 'kernel', version: '0.4.9' }], kind: 'stable', stub: newest });
    make({ root, targets: [{ dir: 'kernel', version: '0.4.8' }], kind: 'stable', stub: older });

    expect(newest.created()).toContain('--latest=false');
    expect(newest.created()).not.toContain('--latest');
    expect(older.created()).toContain('--latest=false');
  });

  test('a title names the package unless the tag is core-server, so two titles never collide', () => {
    expect(GithubRelease.titleOf({ target: { dir: 'core-server', version: '0.4.7' } })).toBe(
      'IGNIS 0.4.7',
    );
    expect(GithubRelease.titleOf({ target: { dir: 'kernel', version: '0.4.6' } })).toBe(
      'IGNIS kernel 0.4.6',
    );
    expect(GithubRelease.titleOf({ target: { dir: 'core-worker', version: '0.4.8-1' } })).toBe(
      'IGNIS core-worker 0.4.8-1',
    );
  });

  test('a prerelease of another package is still a Pre-release, never Latest, with its own title', () => {
    const stub = stubGh({});

    make({
      root: fixture(),
      targets: [{ dir: 'kernel', version: '0.4.8-1' }],
      kind: 'prerelease',
      stub,
    });

    expect(stub.created()).toContain('--prerelease');
    expect(stub.created()).not.toContain('--latest');
    expect(stub.created()[stub.created().indexOf('--title') + 1]).toBe('IGNIS kernel 0.4.8-1');
  });

  test('a stable that is not the newest of its package is never marked Latest', () => {
    const stub = stubGh({});

    make({
      root: fixture(),
      targets: [{ dir: 'core-server', version: '0.4.7' }],
      kind: 'stable',
      stub,
      withSubjectFallback: true,
    });

    expect(stub.created()).toContain('--latest=false');
    expect(stub.created()).not.toContain('--latest');
  });

  test('a prerelease is marked Pre-release and never Latest, with the install line and the issue subjects only', () => {
    const stub = stubGh({});
    const outcome = make({
      root: fixture(),
      targets: [
        { dir: 'kernel', version: '0.4.8-1' },
        { dir: 'core-server', version: '0.4.8-1' },
      ],
      kind: 'prerelease',
      stub,
    });

    expect(outcome.state).toBe('created');
    expect(stub.created()).toContain('--prerelease');
    expect(stub.created()).not.toContain('--latest');
    expect(stub.created()[stub.created().indexOf('--title') + 1]).toBe('IGNIS 0.4.8-1');
    expect(stub.notes()).toContain('npm install @x/core@next');
    expect(stub.notes()).toContain('[#11] fix(c): third change');
    expect(stub.notes()).not.toContain('housekeeping');
    expect(stub.notes()).not.toContain('[#10]');
  });

  test('the release commits of the loop are not listed, even when they carry an issue', () => {
    const stub = stubGh({});

    make({
      root: fixture(),
      targets: [{ dir: 'core-server', version: '0.4.8-1' }],
      kind: 'prerelease',
      stub,
    });

    expect(stub.notes()).not.toContain('chore(kernel): release');
    expect(stub.notes()).not.toContain('chore(core-server): release');
    expect(
      GithubReleaseConstants.RELEASE_COMMIT_SUBJECT.test(
        '[#11] chore(core-server): release v0.4.8-1 [prerelease]',
      ),
    ).toBe(true);
    expect(
      GithubReleaseConstants.RELEASE_COMMIT_SUBJECT.test('[#11] chore(ci): release notes for v1'),
    ).toBe(false);
  });

  test('more subjects than the cap are cut, and the notes say how many were left out', () => {
    const subjects = Array.from({ length: 33 }, (_, index) => `[#${index}] change ${index}`);
    const capped = GithubRelease.cappedSubjects({ subjects });

    expect(capped).toHaveLength(31);
    expect(capped.at(-1)).toBe('... and 3 more');
    expect(GithubRelease.cappedSubjects({ subjects: subjects.slice(0, 30) })).toHaveLength(30);
  });

  test('a tag that has a Release is skipped, and nothing is created', () => {
    const stub = stubGh({ existing: true });
    const outcome = make({ root: fixture(), targets: SERVER_STABLE, kind: 'stable', stub });

    expect(outcome.state).toBe('exists');
    expect(stub.calls).toEqual([['release', 'view', 'core-server-v0.4.8', '--json', 'tagName']]);
    expect(stub.created()).toEqual([]);
  });

  test('an unknown kind, a version that is not the kind and no package are refused or failed before gh is asked anything', () => {
    const stub = stubGh({});
    const root = fixture();

    expect(make({ root, targets: SERVER_STABLE, kind: 'latest', stub }).state).toBe('refused');
    expect(make({ root, targets: SERVER_STABLE, kind: 'prerelease', stub }).state).toBe('refused');
    expect(
      make({
        root,
        targets: [{ dir: 'core-server', version: '0.4.8-1' }],
        kind: 'stable',
        stub,
      }).state,
    ).toBe('refused');
    expect(make({ root, targets: [], kind: 'stable', stub }).state).toBe('failed');
    expect(stub.calls).toEqual([]);
  });

  test('a computed tag that is the tag of the atlas index is refused before gh is asked anything', () => {
    const root = scratch();
    const stub = stubGh({});

    git({ cwd: root, args: ['init', '-q', '-b', 'develop'] });
    // A pattern no real manifest has: `<dir>-<version>` turns the package `atlas` at the version `index` into the tag.
    commit({
      root,
      message: '[#1] feat(a): first',
      files: {
        '.agents/vulcan.manifest.json': `${JSON.stringify({
          release: { tagPattern: '<dir>-<version>' },
          knowledge: { changelogs: 'docs/changelogs' },
          packages: [{ name: '@x/atlas', dir: 'atlas' }],
        })}\n`,
      },
    });

    const outcome = GithubRelease.create({
      cwd: root,
      targets: [{ dir: 'atlas', version: 'index' }],
      kind: 'stable',
      gh: stub.gh,
      scratchRoot: scratch(),
    });

    expect(outcome.state).toBe('refused');
    expect(outcome.message).toContain('atlas index');
    expect(stub.calls).toEqual([]);
  });

  test('a failed create, and a git failure, are outcomes with a reason, not exceptions', () => {
    const failing = make({
      root: fixture(),
      targets: SERVER_STABLE,
      kind: 'stable',
      stub: stubGh({ createFails: true }),
    });
    const broken = make({
      root: scratch(),
      targets: SERVER_STABLE,
      kind: 'stable',
      stub: stubGh({}),
    });

    expect(failing.state).toBe('failed');
    expect(failing.message).toContain('HTTP 422');
    expect(broken.state).toBe('failed');
  });

  test('a stable with no entry in its range says there is no change for users; a backfill falls back to the commits', () => {
    const root = fixture();

    commit({ root, message: '[#12] chore(x): a change with no entry' });
    tag({ root, name: 'core-server-v0.4.9' });

    const targets = [{ dir: 'core-server', version: '0.4.9' }];
    const stub = stubGh({});
    const backfill = stubGh({});

    expect(make({ root, targets, kind: 'stable', stub }).state).toBe('created');
    expect(stub.notes()).toContain(GithubReleaseConstants.NO_USER_CHANGES);
    expect(stub.notes()).not.toContain('a change with no entry');
    expect(
      make({ root, targets, kind: 'stable', stub: backfill, withSubjectFallback: true }).state,
    ).toBe('created');
    expect(backfill.notes()).toContain('[#12] chore(x): a change with no entry');
  });

  test('a backfill whose range holds no commit of its own says there is no change for users', () => {
    const root = fixture();

    tag({ root, name: 'core-server-v0.4.9' });

    const stub = stubGh({});

    expect(
      make({
        root,
        targets: [{ dir: 'core-server', version: '0.4.9' }],
        kind: 'stable',
        stub,
        withSubjectFallback: true,
      }).state,
    ).toBe('created');
    expect(stub.notes()).toContain(GithubReleaseConstants.NO_USER_CHANGES);
  });

  test('a dry run stops before gh creates anything and returns the notes and whether it would be Latest', () => {
    const stub = stubGh({});
    const outcome = make({
      root: fixture(),
      targets: [{ dir: 'core-server', version: '0.4.7' }],
      kind: 'stable',
      stub,
      withSubjectFallback: true,
      dryRun: true,
    });

    expect(outcome.state).toBe('planned');
    expect(outcome.message).toContain('not Latest');
    expect(outcome.message).toContain('Old change');
    expect(stub.created()).toEqual([]);
  });

  test('a subject cannot ping anyone or close an issue through the notes', () => {
    const body = GithubRelease.bodyOf({
      kind: 'prerelease',
      notes: '',
      subjects: ['[#9] fixes #3, thanks @someone', 'closes```'],
      packages: [{ name: '@x/core', version: '0.4.8-1' }],
    });

    expect(body).toContain("```text\n[#9] fixes #3, thanks @someone\ncloses'''\n```");
  });
});

describe('GithubRelease.publicText', () => {
  const ENTRY = [
    '## skipMigrate is removed from @model',
    '',
    'Use `@model({ migration: { use: false } })` or ask @someone; `@venizia/ignis-kernel` stays as it is.',
    '',
    '- `@venizia/ignis-kernel` and @venizia/ignis-helpers update together, mail a@b.com or see https://github.com/@x.',
    '- See [Models](/references/base/models) and [the docs](https://ignis.venizia.ai/guides) and [x](//cdn.test/y).',
    '',
    '```ts',
    '@model({ skipMigrate: true }); // [x](/not/a/link) @inside',
    '```',
    '',
  ].join('\n');

  test('a bare mention outside code is put in backticks, so it cannot notify an account or a team', () => {
    const text = GithubRelease.publicText({ text: ENTRY });

    expect(text).toContain('## skipMigrate is removed from `@model`');
    expect(text).toContain('or ask `@someone`;');
    expect(text).toContain('and `@venizia/ignis-helpers` update together');
  });

  test('code spans, fenced blocks, e-mail addresses and URLs are left as they are', () => {
    const text = GithubRelease.publicText({ text: ENTRY });

    expect(text).toContain('Use `@model({ migration: { use: false } })` or');
    expect(text).toContain('`@venizia/ignis-kernel` stays');
    expect(text).toContain('mail a@b.com or see https://github.com/@x.');
    expect(text).toContain(
      '```ts\n@model({ skipMigrate: true }); // [x](/not/a/link) @inside\n```',
    );
  });

  test('a root-relative link points at the wiki; an absolute and a protocol-relative one do not change', () => {
    const text = GithubRelease.publicText({ text: ENTRY });

    expect(text).toContain('[Models](https://ignis.venizia.ai/references/base/models)');
    expect(text).toContain('[the docs](https://ignis.venizia.ai/guides)');
    expect(text).toContain('[x](//cdn.test/y)');
  });

  test('the notes of a stable carry the neutralised entry, read from the tag', () => {
    const root = fixture();

    commit({
      root,
      message: '[#14] feat(e): entry with a mention',
      files: { 'docs/changelogs/2026-10-28-e.md': entry({ title: 'Change E', body: ENTRY }) },
    });
    tag({ root, name: 'core-server-v0.4.9' });

    const notes = GithubRelease.stableNotes({
      cwd: root,
      from: 'core-server-v0.4.8',
      to: 'core-server-v0.4.9',
      folder: 'docs/changelogs',
    });

    expect(notes).toContain('## skipMigrate is removed from `@model`');
    expect(notes).toContain('(https://ignis.venizia.ai/references/base/models)');
  });
});

describe('GithubRelease.publicText over code that wraps and fences of any length', () => {
  test('a code span wrapped over two lines is code on both, and gains no mention', () => {
    const text = GithubRelease.publicText({
      text: 'Use `@model({\n  migration: @inside })` here, or @outside.\n\nNext `a\n\n@paragraph` @after',
    });

    expect(text).toContain('Use `@model({\n  migration: @inside })` here, or `@outside`.');
    // A span never crosses a blank line: the stray backtick of one paragraph does not hide the mentions of the next.
    expect(text).toContain('`@paragraph`');
    expect(text).toContain('`@after`');
  });

  test('a span does not run on into the next list item, a heading or a table row', () => {
    const text = GithubRelease.publicText({
      text: '- an unbalanced ` tick and @first\n- a `real` span, then @second\n## a heading with @third\n| @fourth | `x` |',
    });

    expect(text).toContain('`@first`');
    expect(text).toContain('`@second`');
    expect(text).toContain('## a heading with `@third`');
    expect(text).toContain('| `@fourth` | `x` |');
  });

  test('a four-backtick fence holds a three-backtick line, and a tilde fence holds a backtick one', () => {
    const text = GithubRelease.publicText({
      text: '````md\n```ts\n@inside\n```\n@still inside\n````\n@outside\n\n~~~~\n```\n@tilde\n~~~~\n@outside again',
    });

    expect(text).toContain('```ts\n@inside\n```\n@still inside\n````');
    expect(text).toContain('````\n`@outside`');
    expect(text).toContain('~~~~\n```\n@tilde\n~~~~\n`@outside` again');
  });

  test('an escaped mention is left alone', () => {
    expect(GithubRelease.publicText({ text: 'write \\@name to show it' })).toBe(
      'write \\@name to show it',
    );
  });

  test('over every dated entry of the changelog folder, no @word outside code survives', () => {
    const folder = resolve(import.meta.dir, '../../../docs/wiki/content/changelogs');
    const names = readdirSync(folder).filter((name) =>
      GithubReleaseConstants.DATED_ENTRY.test(name),
    );
    const surviving: string[] = [];

    for (const name of names) {
      const shown = GithubRelease.publicText({
        text: GithubRelease.stripEntry({ text: readFileSync(join(folder, name), 'utf8') }),
      });
      // The check does not use the code under test: fenced lines out by their markers, then every backtick span.
      let fenced = false;
      const outside = shown
        .split('\n')
        .filter((line) => {
          if (/^\s*(?:```|~~~)/.test(line)) {
            fenced = !fenced;

            return false;
          }

          return !fenced;
        })
        .join('\n')
        .replace(/(`+)[\s\S]*?\1/g, '');

      for (const mention of outside.matchAll(GithubReleaseConstants.MENTION)) {
        surviving.push(`${name}: ${mention[0]}`);
      }
    }

    expect(names.length).toBeGreaterThan(200);
    expect(surviving).toEqual([]);
  });
});

describe('GithubRelease.cutAtLine', () => {
  const text = (fence: string) => `intro\n${fence}text\n${'inside\n'.repeat(50)}${fence}\nafter\n`;

  test('closes an open fence with the full run of its opener', () => {
    for (const fence of ['```', '````', '~~~', '~~~~~']) {
      const cut = GithubRelease.cutAtLine({ text: text(fence), max: 60 });

      expect(cut.endsWith(`\n${fence}`)).toBe(true);
      expect(GithubRelease.fenceStates({ lines: cut.split('\n') }).open).toBeUndefined();
    }
  });

  test('leaves a cut outside a fence as it is', () => {
    expect(GithubRelease.cutAtLine({ text: 'one\ntwo\nthree\n', max: 7 })).toBe('one');
  });
});

describe('GithubRelease.ghOf refuses at run time what the script must never ask of gh', () => {
  const gh = GithubRelease.ghOf({ cwd: scratch() });

  test('only release view and release create are allowed', () => {
    expect(
      GithubRelease.refusalOf({ args: ['release', 'view', 'x', '--json', 'tagName'] }),
    ).toBeUndefined();
    expect(
      GithubRelease.refusalOf({
        args: ['release', 'create', 'x', '--verify-tag', '--latest=false'],
      }),
    ).toBeUndefined();
  });

  test('delete, edit, upload, api and a missing command are refused before anything is spawned', () => {
    for (const args of [
      ['release', 'delete', 'x', '--yes'],
      ['release', 'edit', 'x', '--notes', 'y'],
      ['release', 'upload', 'x', 'file'],
      ['api', '-X', 'DELETE', 'repos/x/y/releases/1'],
      ['repo', 'delete', 'x'],
      ['release'],
      [],
    ]) {
      expect(() => gh({ args })).toThrow('gh refused');
    }
  });

  test('a forcing argument is refused on an allowed command', () => {
    for (const flag of ['--force', '-f', '--delete', '-d', '-D', '--cleanup-tag']) {
      expect(() => gh({ args: ['release', 'create', 'x', flag] })).toThrow('forces or deletes');
    }
  });

  test('the tag of the atlas index is refused on an allowed command', () => {
    expect(() => gh({ args: ['release', 'view', 'atlas-index'] })).toThrow('atlas index');
    expect(() => gh({ args: ['release', 'create', 'atlas-index', '--prerelease'] })).toThrow(
      'atlas index',
    );
  });

  test('a refusal that reaches create is a failed outcome with its reason, not an exception', () => {
    const outcome = GithubRelease.create({
      cwd: fixture(),
      targets: SERVER_STABLE,
      kind: 'stable',
      gh: () => {
        throw new Error('gh refused: nope');
      },
      scratchRoot: scratch(),
    });

    expect(outcome).toEqual({ state: 'failed', message: 'gh refused: nope' });
  });
});

describe('GithubRelease.bodyOf with notes too long for a Release', () => {
  const body = (opts: { notes: string }) =>
    GithubRelease.bodyOf({
      kind: 'stable',
      notes: opts.notes,
      subjects: [],
      packages: [{ name: '@x/core', version: '0.4.8' }],
    });

  test('a body of at most 120000 characters is untouched', () => {
    const notes = 'a line\n'.repeat(1000);

    expect(body({ notes })).toBe(
      `${notes}\n\n## Packages\n\n- [@x/core@0.4.8](https://www.npmjs.com/package/@x/core/v/0.4.8)\n`,
    );
  });

  test('a longer body is cut on a whole line, says so, links to the changelog and keeps the Packages section', () => {
    const text = body({ notes: 'a line of the notes\n'.repeat(10_000) });

    expect(text.length).toBeLessThanOrEqual(GithubReleaseConstants.MAX_BODY_LENGTH);
    expect(text).toContain('... cut: these notes are longer than a GitHub Release can hold.');
    expect(text).toContain('https://ignis.venizia.ai/changelogs/');
    expect(text.split('\n## Packages\n')[1]).toContain('@x/core@0.4.8');
    expect(
      text
        .split('\n')
        .filter((line) => line.startsWith('a line of the'))
        .every((line) => line === 'a line of the notes'),
    ).toBe(true);
  });

  test('a cut inside a fenced block closes the fence, so the rest is not turned into code', () => {
    const text = body({ notes: `\`\`\`text\n${'inside the fence\n'.repeat(10_000)}\`\`\`\n` });
    const fences = text.split('\n').filter((line) => line.startsWith('```'));

    expect(text.length).toBeLessThanOrEqual(GithubReleaseConstants.MAX_BODY_LENGTH);
    expect(fences).toHaveLength(2);
    expect(text.indexOf('... cut:')).toBeGreaterThan(text.lastIndexOf('```'));
  });
});

describe('GithubRelease.manifestOf', () => {
  test('names what is missing instead of failing with a bare TypeError', () => {
    const root = scratch();

    mkdirSync(join(root, '.agents'), { recursive: true });
    writeFileSync(join(root, '.agents', 'vulcan.manifest.json'), '{"packages":[]}\n');

    expect(() => GithubRelease.manifestOf({ cwd: root })).toThrow('release.tagPattern');
    expect(GithubRelease.manifestOf({ cwd: fixture() }).packages).toEqual(MANIFEST.packages);
  });
});

describe('GithubRelease.main', () => {
  const run = (opts: { args: string[]; root: string; stub: IStubGh; summary?: string }) =>
    GithubRelease.main({
      args: opts.args,
      cwd: opts.root,
      gh: opts.stub.gh,
      env: {
        RUNNER_TEMP: scratch(),
        ...(opts.summary === undefined ? {} : { GITHUB_STEP_SUMMARY: opts.summary }),
      },
    });

  test('create exits 0 for a made or an existing Release and 1 for a failed one, and a failure and a crash reach the summary', () => {
    const summary = join(scratch(), 'summary');
    const crashed = join(scratch(), 'summary');
    const root = fixture();
    const args = ['create', '--targets', 'kernel=0.4.8,core-server=0.4.8', '--kind', 'stable'];

    writeFileSync(summary, '');
    writeFileSync(crashed, '');

    expect(run({ args, root, stub: stubGh({}), summary })).toBe(0);
    expect(run({ args, root, stub: stubGh({ existing: true }) })).toBe(0);
    expect(run({ args, root, stub: stubGh({ createFails: true }), summary })).toBe(1);
    expect(readFileSync(summary, 'utf8')).toContain('failed');
    expect(run({ args, root: scratch(), stub: stubGh({}), summary: crashed })).toBe(1);
    expect(readFileSync(crashed, 'utf8')).toContain('GitHub Release');
  });

  test('a line break in what gh says cannot start a workflow command in the log or in the summary', () => {
    const summary = join(scratch(), 'summary');
    const logged: string[] = [];
    const log = spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
      logged.push(parts.join(' '));
    });

    writeFileSync(summary, '');

    try {
      expect(
        run({
          args: ['create', '--targets', 'kernel=0.4.8,core-server=0.4.8', '--kind', 'stable'],
          root: fixture(),
          stub: stubGh({
            createFails: true,
            createStderr: 'HTTP 403\n::add-mask::injected\r\n::stop::',
          }),
          summary,
        }),
      ).toBe(1);
    } finally {
      log.mockRestore();
    }

    const lines = [...logged.join('\n').split('\n'), ...readFileSync(summary, 'utf8').split('\n')];

    expect(lines.filter((line) => line.startsWith('::'))).toEqual([]);
    expect(logged.join('\n')).toContain('HTTP 403 ::add-mask::injected ::stop::');
    expect(readFileSync(summary, 'utf8')).toContain('HTTP 403 ::add-mask::injected ::stop::');
  });

  test('a dry run keeps its many lines but starts every line after the first with "| ", a character the runner does not trim', () => {
    const printed = GithubRelease.printable({
      outcome: { state: 'planned', message: 'tag (stable):\n\n::add-mask::x\n  ::stop::\nbody' },
    });
    const lines = printed.split('\n');

    expect(lines.filter((line) => line.trimStart().startsWith('::'))).toEqual([]);
    expect(lines.slice(1).every((line) => line.startsWith('| '))).toBe(true);
    expect(lines).toHaveLength(5);
  });

  test('a list of targets the manifest cannot read is a failure in the summary, not a crash of the step', () => {
    const summary = join(scratch(), 'summary');
    const root = fixture();

    writeFileSync(summary, '');

    expect(
      run({
        args: ['create', '--targets', 'nothing=1.0.0', '--kind', 'stable'],
        root,
        stub: stubGh({}),
        summary,
      }),
    ).toBe(1);
    expect(readFileSync(summary, 'utf8')).toContain('not in');
  });

  test('a missing flag or an unknown command (the old --tag form among them) exits 2', () => {
    const root = fixture();
    const stub = stubGh({});

    expect(run({ args: ['create', '--kind', 'stable'], root, stub })).toBe(2);
    expect(run({ args: ['create', '--targets', 'kernel=0.4.8'], root, stub })).toBe(2);
    expect(
      run({ args: ['create', '--tag', 'x', '--version', '1', '--kind', 'stable'], root, stub }),
    ).toBe(2);
    expect(run({ args: ['publish'], root, stub })).toBe(2);
    expect(stub.calls).toEqual([]);
  });

  test('backfill writes nothing without --yes, with it makes the Release of one tag, and refuses a tag that is no package', () => {
    const root = fixture();
    const dry = stubGh({});
    const written = stubGh({});
    const pre = stubGh({});

    expect(run({ args: ['backfill', '--tag', 'core-server-v0.4.7'], root, stub: dry })).toBe(0);
    expect(dry.created()).toEqual([]);
    expect(
      run({ args: ['backfill', '--tag', 'core-server-v0.4.7', '--yes'], root, stub: written }),
    ).toBe(0);
    expect(written.created()).toContain('--latest=false');
    expect(
      run({ args: ['backfill', '--tag', 'core-server-v0.4.8-1', '--yes'], root, stub: pre }),
    ).toBe(0);
    expect(pre.created()).toContain('--prerelease');
    expect(
      run({ args: ['backfill', '--tag', 'atlas-index', '--yes'], root, stub: stubGh({}) }),
    ).toBe(2);
  });
});
