import { describe, expect, test } from 'bun:test';
import type { TReleaseMode } from '../release-constants';
import type { IPlanEntry } from '../release-plan-input';
import { type IReleasePorts, ReleaseRun } from '../release-run';

const TARBALLS = '/work/release-tarballs';

interface IFakePackage {
  name: string;
  version: string;
  siblings: string[];
  third?: Record<string, string>;
}

/** The workspace, the registry and the remote of a release, in memory. `run` answers the commands the script issues. */
class FakeWorld {
  disk = new Map<string, IFakePackage>();
  origin = new Map<string, string>();
  npm = new Set<string>();
  tags = new Map<string, string>();
  commits: Array<{ sha: string; subject: string; dir: string; version: string; pushed: boolean }> =
    [];
  calls: string[] = [];
  logs: string[] = [];
  highest = new Map<string, string>();
  packed = new Map<string, Record<string, unknown>>();
  faults = {
    publish: new Set<string>(),
    pushFor: new Set<string>(),
    tagPushFor: new Set<string>(),
    wait: new Set<string>(),
    protocolLeak: new Set<string>(),
    stalePin: new Set<string>(),
    corruptSha: false,
  };
  publishes: string[] = [];
  private shaReads = 0;

  constructor() {
    this.add({
      dir: 'inversion',
      name: '@venizia/ignis-inversion',
      version: '0.4.4',
      siblings: [],
    });
    this.add({
      dir: 'helpers',
      name: '@venizia/ignis-helpers',
      version: '0.4.5',
      siblings: ['inversion'],
    });
    this.add({
      dir: 'kernel',
      name: '@venizia/ignis-kernel',
      version: '0.4.5',
      siblings: ['helpers'],
    });
    this.add({
      dir: 'connectors',
      name: '@venizia/ignis-connectors',
      version: '0.4.5',
      siblings: ['kernel', 'helpers'],
      third: { zod: '^4.0.0' },
    });
    this.add({
      dir: 'core-server',
      name: '@venizia/ignis',
      version: '0.4.5',
      siblings: ['connectors', 'kernel'],
    });
    for (const [dir, pkg] of this.disk) {
      this.origin.set(dir, pkg.version);
      this.npm.add(`${pkg.name}@${pkg.version}`);
    }
  }

  private add(opts: { dir: string } & IFakePackage): void {
    const { dir, ...pkg } = opts;
    this.disk.set(dir, pkg);
  }

  /** What a fresh runner sees: the files of the remote, no local commits. */
  checkout(): void {
    for (const [dir, pkg] of this.disk) {
      pkg.version = this.origin.get(dir) ?? pkg.version;
    }
    this.commits = this.commits.filter((commit) => commit.pushed);
  }

  dirOf(name: string): string {
    return [...this.disk].find(([, pkg]) => pkg.name === name)?.[0] ?? '';
  }

  static bump(opts: { version: string; mode: string }): string {
    const [core, pre] = opts.version.split('-');
    const [major, minor, patch] = core.split('.').map(Number);
    if (opts.mode === 'prerelease') {
      return pre === undefined ? `${major}.${minor}.${patch + 1}-0` : `${core}-${Number(pre) + 1}`;
    }
    if (opts.mode === 'patch') {
      return pre === undefined ? `${major}.${minor}.${patch + 1}` : core;
    }
    if (opts.mode === 'minor') {
      return `${major}.${minor + 1}.0`;
    }
    return `${major + 1}.0.0`;
  }

  ports(): IReleasePorts {
    return {
      run: async (opts) => this.run(opts),
      readManifest: async ({ dir }) => {
        const pkg = this.disk.get(dir);
        if (!pkg) {
          throw new Error(`no package ${dir}`);
        }
        return { name: pkg.name, version: pkg.version };
      },
      sha256: async ({ path }) => {
        this.shaReads += 1;
        return this.faults.corruptSha && this.shaReads > 1 ? `other-${path}` : `sha-${path}`;
      },
      registry: {
        isPublished: async ({ packageName, version }) => this.npm.has(`${packageName}@${version}`),
        waitForTarball: async ({ packageName, version }) => {
          this.calls.push(`wait ${packageName}@${version}`);
          if (this.faults.wait.has(`${packageName}@${version}`)) {
            throw new Error(`${packageName}@${version} never answered 200`);
          }
        },
      },
      log: (line) => {
        this.logs.push(line);
      },
    };
  }

  private async run(opts: {
    command: string[];
    cwd?: string;
    allowFailure?: boolean;
  }): Promise<{ stdout: string; exitCode: number }> {
    const { command, cwd } = opts;
    const dir = cwd?.replace(/^packages\//, '') ?? '';
    this.calls.push(`${cwd ? `[${dir}] ` : ''}${command.join(' ')}`);
    const ok = (stdout = '') => ({ stdout, exitCode: 0 });
    const fail = (message: string) => {
      if (opts.allowFailure) {
        return { stdout: '', exitCode: 1 };
      }
      throw new Error(message);
    };
    const [tool, verb] = command;
    const pkg = this.disk.get(dir);

    if (tool === 'npm' && verb === 'version' && pkg) {
      pkg.version = FakeWorld.bump({ version: pkg.version, mode: command[2] });
      return ok(pkg.version);
    }
    if (tool === 'bun' && verb === 'pm' && pkg) {
      const file = command[command.indexOf('--filename') + 1];
      const dependencies: Record<string, string> = { ...pkg.third };
      for (const sibling of pkg.siblings) {
        const target = this.disk.get(sibling);
        const stale = this.faults.stalePin.has(`${dir}:${sibling}`);
        dependencies[target?.name ?? sibling] = this.faults.protocolLeak.has(dir)
          ? 'workspace:*'
          : stale
            ? '0.0.0'
            : (target?.version ?? '');
      }
      this.packed.set(file, { name: pkg.name, version: pkg.version, dependencies });
      return ok();
    }
    if (tool === 'tar') {
      return ok(JSON.stringify(this.packed.get(command[2])));
    }
    if (tool === 'npm' && verb === 'publish') {
      const file = command[2];
      const manifest = this.packed.get(file) as { name: string; version: string };
      const key = `${manifest.name}@${manifest.version}`;
      if (this.faults.publish.has(key)) {
        return fail(`publish of ${key} rejected`);
      }
      this.npm.add(key);
      this.publishes.push(key);
      return ok(`+ ${key}`);
    }
    if (tool === 'npm' && verb === 'view') {
      const current = this.highest.get(command[3]);
      return current ? ok(current) : fail('no highest');
    }
    if (tool === 'npm' && verb === 'dist-tag') {
      const [name, version] = command[3].split(/@(?=[^@]*$)/);
      this.highest.set(name, version);
      return ok();
    }
    if (tool === 'git' && verb === 'commit' && pkg) {
      this.commits.push({
        sha: `sha${this.commits.length + 1}`,
        subject: command[3],
        dir,
        version: pkg.version,
        pushed: false,
      });
      return ok();
    }
    if (tool === 'git' && verb === 'push' && command[3]?.startsWith('HEAD')) {
      const last = [...this.commits].reverse().find((commit) => !commit.pushed);
      if (last && this.faults.pushFor.has(last.dir)) {
        return fail('push rejected: develop moved');
      }
      for (const commit of this.commits) {
        if (!commit.pushed) {
          commit.pushed = true;
          this.origin.set(commit.dir, commit.version);
        }
      }
      return ok();
    }
    if (tool === 'git' && verb === 'tag') {
      return ok();
    }
    if (tool === 'git' && verb === 'push') {
      const tag = command[3];
      if ([...this.faults.tagPushFor].some((entry) => tag.startsWith(`${entry}-v`))) {
        return fail('tag push rejected');
      }
      this.tags.set(tag, tag);
      return ok();
    }
    if (tool === 'git' && verb === 'ls-remote') {
      const tag = command[4].replace('refs/tags/', '');
      return ok(this.tags.has(tag) ? `abc\t${command[4]}` : '');
    }
    if (tool === 'git' && verb === 'log') {
      const needle = command[command.indexOf('--grep') + 1];
      const hit = [...this.commits].reverse().find((commit) => commit.subject.includes(needle));
      return ok(hit?.sha ?? '');
    }

    return ok();
  }

  /** How many times a publish of this package (by folder) succeeded, across every run on this world. */
  publishedCount(dir: string): number {
    const name = this.disk.get(dir)?.name;
    return this.publishes.filter((key) => key.startsWith(`${name}@`)).length;
  }
}

const entries = (...names: string[]): IPlanEntry[] =>
  names.map((name) => ({
    name,
    from:
      name === 'helpers' || name === 'kernel' || name === 'connectors' || name === 'core-server'
        ? '0.4.5'
        : '0.4.4',
  }));

const execute = (opts: {
  world: FakeWorld;
  plan?: IPlanEntry[];
  mode?: TReleaseMode;
  issue?: string;
}) =>
  ReleaseRun.execute({
    entries: opts.plan ?? entries('helpers', 'kernel', 'connectors'),
    mode: opts.mode ?? 'patch',
    issue: opts.issue ?? '638',
    tarballs: TARBALLS,
    ports: opts.world.ports(),
  });

const indexOfCall = (world: FakeWorld, text: string): number =>
  world.calls.findIndex((call) => call.includes(text));

describe('ReleaseRun.execute: a clean run', () => {
  test('releases every package of the plan, one commit and one tag each, on the registry', async () => {
    const world = new FakeWorld();
    const outcomes = await execute({ world });

    expect(
      outcomes.map((outcome) => `${outcome.name}:${outcome.state}:${outcome.version}`),
    ).toEqual(['helpers:published:0.4.6', 'kernel:published:0.4.6', 'connectors:published:0.4.6']);
    expect(world.commits.map((commit) => commit.subject)).toEqual([
      '[#638] chore(helpers): release v0.4.6 [patch]',
      '[#638] chore(kernel): release v0.4.6 [patch]',
      '[#638] chore(connectors): release v0.4.6 [patch]',
    ]);
    expect([...world.tags.keys()]).toEqual([
      'helpers-v0.4.6',
      'kernel-v0.4.6',
      'connectors-v0.4.6',
    ]);
    expect(world.npm.has('@venizia/ignis-kernel@0.4.6')).toBe(true);
    expect(world.npm.has('@venizia/ignis-inversion@0.4.6')).toBe(false);
  });

  test('prints the + line the driver reads, once per published package', async () => {
    const world = new FakeWorld();
    await execute({ world });

    expect(world.logs.filter((line) => line.startsWith('+ '))).toEqual([
      '+ @venizia/ignis-helpers@0.4.6',
      '+ @venizia/ignis-kernel@0.4.6',
      '+ @venizia/ignis-connectors@0.4.6',
    ]);
  });

  test('omits the issue prefix when no issue is given', async () => {
    const world = new FakeWorld();
    await ReleaseRun.execute({
      entries: entries('helpers'),
      mode: 'patch',
      tarballs: TARBALLS,
      ports: world.ports(),
    });

    expect(world.commits[0].subject).toBe('chore(helpers): release v0.4.6 [patch]');
  });

  test('publishes the packed file with exactly these flags, under latest for a stable', async () => {
    const world = new FakeWorld();
    await execute({ world, plan: entries('kernel') });

    expect(world.calls).toContain(
      `npm publish ${TARBALLS}/kernel.tgz --access public --tag latest --ignore-scripts --provenance`,
    );
    expect(world.calls.filter((call) => call.startsWith('bun publish'))).toEqual([]);
  });

  test('publishes under next for a prerelease', async () => {
    const world = new FakeWorld();
    await execute({ world, plan: entries('kernel'), mode: 'prerelease' });

    expect(world.calls).toContain(
      `npm publish ${TARBALLS}/kernel.tgz --access public --tag next --ignore-scripts --provenance`,
    );
    expect(world.npm.has('@venizia/ignis-kernel@0.4.6-0')).toBe(true);
  });

  test('per package, the order is bump, pack, publish, wait, highest, next, commit, push, tag, push tag', async () => {
    const world = new FakeWorld();
    await execute({ world, plan: entries('kernel') });

    const order = [
      '[kernel] npm version patch',
      '[kernel] bun pm pack',
      'npm publish',
      'wait @venizia/ignis-kernel@0.4.6',
      'npm dist-tag add @venizia/ignis-kernel@0.4.6 highest',
      'sync-next-tag.ts --published @venizia/ignis-kernel@0.4.6 --tag latest',
      '[kernel] git commit',
      'git push origin HEAD:develop',
      'git tag -a kernel-v0.4.6',
      'git push origin kernel-v0.4.6',
    ].map((text) => indexOfCall(world, text));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('the next package starts only after the previous one is tagged', async () => {
    const world = new FakeWorld();
    await execute({ world });

    expect(indexOfCall(world, 'git push origin helpers-v0.4.6')).toBeLessThan(
      indexOfCall(world, '[kernel] npm version'),
    );
    expect(indexOfCall(world, 'git push origin kernel-v0.4.6')).toBeLessThan(
      indexOfCall(world, '[connectors] npm version'),
    );
  });

  test('a later tarball pins the version this run gave its sibling', async () => {
    const world = new FakeWorld();
    await execute({ world });

    const connectors = world.packed.get(`${TARBALLS}/connectors.tgz`) as {
      dependencies: Record<string, string>;
    };
    expect(connectors.dependencies['@venizia/ignis-kernel']).toBe('0.4.6');
    expect(connectors.dependencies['@venizia/ignis-helpers']).toBe('0.4.6');
  });

  test('writes the VULCAN preset for core-server only, after its bump and before its pack', async () => {
    const world = new FakeWorld();
    await execute({ world, plan: entries('kernel', 'connectors', 'core-server') });

    const presets = world.calls.filter((call) => call.includes('vulcan-preset.ts'));
    expect(presets).toHaveLength(1);
    expect(indexOfCall(world, '[core-server] npm version')).toBeLessThan(
      indexOfCall(world, 'vulcan-preset.ts'),
    );
    expect(indexOfCall(world, 'vulcan-preset.ts')).toBeLessThan(
      indexOfCall(world, '[core-server] bun pm pack'),
    );
  });
});

describe('ReleaseRun.execute: what stops a package before it publishes', () => {
  test('an unresolved workspace protocol in the packed manifest', async () => {
    const world = new FakeWorld();
    world.faults.protocolLeak.add('kernel');

    await expect(execute({ world, plan: entries('kernel') })).rejects.toThrow(/workspace:/);
    expect(world.calls.some((call) => call.startsWith('npm publish'))).toBe(false);
  });

  test('a sibling pinned at a version other than the one this run gave it', async () => {
    const world = new FakeWorld();
    world.faults.stalePin.add('connectors:kernel');

    await expect(execute({ world })).rejects.toThrow(/ignis-kernel/);
    expect(world.npm.has('@venizia/ignis-connectors@0.4.6')).toBe(false);
  });

  test('a sibling outside the plan that is not on npm', async () => {
    const world = new FakeWorld();
    world.npm.delete('@venizia/ignis-inversion@0.4.4');

    await expect(execute({ world, plan: entries('helpers') })).rejects.toThrow(/ignis-inversion/);
    expect(world.calls.some((call) => call.startsWith('npm publish'))).toBe(false);
  });

  test('a tarball whose checksum changed between packing and publishing', async () => {
    const world = new FakeWorld();
    world.faults.corruptSha = true;

    await expect(execute({ world, plan: entries('kernel') })).rejects.toThrow(/sha256/);
    expect(world.calls.some((call) => call.startsWith('npm publish'))).toBe(false);
  });

  test('a package whose version in git is below the plan', async () => {
    const world = new FakeWorld();
    world.disk.get('kernel')!.version = '0.4.4';

    await expect(execute({ world, plan: entries('kernel') })).rejects.toThrow(/stale/);
    expect(world.calls.some((call) => call.startsWith('npm publish'))).toBe(false);
  });

  test('a package whose version in git is above the plan but not on npm', async () => {
    const world = new FakeWorld();
    world.disk.get('kernel')!.version = '0.4.6';

    await expect(execute({ world, plan: entries('kernel') })).rejects.toThrow(/not on npm/);
    expect(world.calls.some((call) => call.startsWith('npm publish'))).toBe(false);
  });
});

describe('ReleaseRun.execute: a run that stops', () => {
  test('a publish that fails at package k+1 leaves k commits, k tags and exactly those on npm', async () => {
    const world = new FakeWorld();
    world.faults.publish.add('@venizia/ignis-connectors@0.4.6');

    await expect(execute({ world })).rejects.toThrow(/connectors/);

    expect(world.commits.map((commit) => commit.dir)).toEqual(['helpers', 'kernel']);
    expect([...world.tags.keys()]).toEqual(['helpers-v0.4.6', 'kernel-v0.4.6']);
    expect(world.npm.has('@venizia/ignis-kernel@0.4.6')).toBe(true);
    expect(world.npm.has('@venizia/ignis-connectors@0.4.6')).toBe(false);
  });

  test('every package with a release commit is on npm', async () => {
    const world = new FakeWorld();
    world.faults.publish.add('@venizia/ignis-connectors@0.4.6');
    await expect(execute({ world })).rejects.toThrow();

    for (const commit of world.commits) {
      expect(world.npm.has(`${world.disk.get(commit.dir)!.name}@${commit.version}`)).toBe(true);
    }
  });

  test('a rejected push stops the run, never rebases, and names what is missing', async () => {
    const world = new FakeWorld();
    world.faults.pushFor.add('kernel');

    await expect(execute({ world })).rejects.toThrow(/push/);

    expect(world.calls.some((call) => /git (pull|rebase|fetch)/.test(call))).toBe(false);
    expect(world.npm.has('@venizia/ignis-kernel@0.4.6')).toBe(true);
    expect(world.tags.has('kernel-v0.4.6')).toBe(false);
    expect(world.calls.some((call) => call.includes('[connectors] npm version'))).toBe(false);
    expect(world.logs.join('\n')).toMatch(
      /@venizia\/ignis-kernel@0.4.6 is published.*release commit/,
    );
  });

  test('a tarball that never answers 200 stops before the commit and says so', async () => {
    const world = new FakeWorld();
    world.faults.wait.add('@venizia/ignis-kernel@0.4.6');

    await expect(execute({ world, plan: entries('kernel') })).rejects.toThrow(/never answered/);

    expect(world.commits).toEqual([]);
    expect(world.tags.size).toBe(0);
    expect(world.logs.join('\n')).toMatch(/published.*release commit.*tag/s);
  });

  test('a tag push that fails says the tag is missing and the commit is there', async () => {
    const world = new FakeWorld();
    world.faults.tagPushFor.add('kernel');

    await expect(execute({ world, plan: entries('kernel') })).rejects.toThrow(/tag push/);

    expect(world.commits).toHaveLength(1);
    expect(world.logs.join('\n')).toMatch(/kernel-v0.4.6/);
  });
});

describe('ReleaseRun.execute: dispatching the same plan again', () => {
  test('after a failure at package k+1, every package ends up released exactly once', async () => {
    const world = new FakeWorld();
    world.faults.publish.add('@venizia/ignis-connectors@0.4.6');
    await expect(execute({ world })).rejects.toThrow();

    world.faults.publish.clear();
    world.checkout();
    const outcomes = await execute({ world });

    expect(outcomes.map((outcome) => `${outcome.name}:${outcome.state}`)).toEqual([
      'helpers:skipped',
      'kernel:skipped',
      'connectors:published',
    ]);
    for (const dir of ['helpers', 'kernel', 'connectors']) {
      expect(world.publishedCount(dir)).toBe(1);
    }
    expect([...world.tags.keys()]).toEqual([
      'helpers-v0.4.6',
      'kernel-v0.4.6',
      'connectors-v0.4.6',
    ]);
    expect(world.logs.filter((line) => line.startsWith('= '))).toEqual([
      '= @venizia/ignis-helpers@0.4.6',
      '= @venizia/ignis-kernel@0.4.6',
    ]);
  });

  test('a publish that landed and a push that failed is recorded without publishing again', async () => {
    const world = new FakeWorld();
    world.faults.pushFor.add('kernel');
    await expect(execute({ world })).rejects.toThrow();

    world.faults.pushFor.clear();
    world.checkout();
    const outcomes = await execute({ world });

    expect(outcomes.map((outcome) => `${outcome.name}:${outcome.state}`)).toEqual([
      'helpers:skipped',
      'kernel:healed',
      'connectors:published',
    ]);
    expect(world.publishedCount('kernel')).toBe(1);
    expect(world.tags.has('kernel-v0.4.6')).toBe(true);
    expect(world.commits.filter((commit) => commit.dir === 'kernel' && commit.pushed)).toHaveLength(
      1,
    );
  });

  test('a commit that is pushed with its tag missing gets the tag on that commit, and nothing is published', async () => {
    const world = new FakeWorld();
    world.faults.tagPushFor.add('kernel');
    await expect(execute({ world, plan: entries('kernel') })).rejects.toThrow();

    world.faults.tagPushFor.clear();
    world.checkout();
    const outcomes = await execute({ world, plan: entries('kernel') });

    expect(outcomes.map((outcome) => outcome.state)).toEqual(['healed']);
    expect(world.publishedCount('kernel')).toBe(1);
    expect(world.tags.has('kernel-v0.4.6')).toBe(true);
    expect(world.calls.some((call) => /git tag -a kernel-v0.4.6 .* sha\d+/.test(call))).toBe(true);
  });

  test('a registry whose packument is stale still counts the version as published (the port answers true)', async () => {
    const world = new FakeWorld();
    await execute({ world, plan: entries('kernel') });
    world.checkout();

    const outcomes = await execute({ world, plan: entries('kernel') });

    expect(outcomes.map((outcome) => outcome.state)).toEqual(['skipped']);
    expect(world.publishedCount('kernel')).toBe(1);
  });
});

describe('ReleaseRun.checkManifest', () => {
  const siblings = new Map([
    ['@venizia/ignis-kernel', '0.4.6'],
    ['@venizia/ignis-helpers', '0.4.6'],
  ]);
  const check = (manifest: Record<string, unknown>, pending: string[] = []) =>
    ReleaseRun.checkManifest({
      text: JSON.stringify(manifest),
      version: '0.4.6',
      siblings,
      pending: new Set(pending),
    });

  test('is empty for a manifest that pins its siblings to the workspace and carries the target version', () => {
    expect(
      check({
        version: '0.4.6',
        dependencies: { '@venizia/ignis-kernel': '0.4.6', zod: '^4.0.0' },
        peerDependencies: { '@venizia/ignis-helpers': '0.4.6' },
      }),
    ).toEqual([]);
  });

  test('names an unresolved protocol on a third-party dependency, not only on a sibling', () => {
    const problems = check({ version: '0.4.6', dependencies: { zod: 'catalog:' } });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('catalog:/workspace:');
  });

  test('names a tarball that carries another version than the run releases', () => {
    expect(check({ version: '0.4.5' })[0]).toContain('0.4.5');
  });

  test('names a sibling pinned at another version, in dependencies and in peerDependencies', () => {
    const problems = check({
      version: '0.4.6',
      dependencies: { '@venizia/ignis-kernel': '0.4.5' },
      peerDependencies: { '@venizia/ignis-helpers': '0.4.5' },
    });

    expect(problems).toHaveLength(2);
  });

  test('names a dependency on a package this run releases later', () => {
    const problems = check(
      { version: '0.4.6', dependencies: { '@venizia/ignis-kernel': '0.4.6' } },
      ['@venizia/ignis-kernel'],
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('released after');
  });
});

describe('ReleaseRun.shouldMoveHighest', () => {
  test.each([
    ['nothing there yet', undefined, '0.4.6', true],
    ['a lower stable', '0.4.5', '0.4.6', true],
    ['a prerelease of the same version', '0.4.6-1', '0.4.6', true],
    ['a newer prerelease (a stable never moves it back)', '0.4.10-0', '0.4.9', false],
    ['the same version', '0.4.6', '0.4.6', false],
  ])('%s', (_label, current, published, expected) => {
    expect(ReleaseRun.shouldMoveHighest({ current, published })).toBe(expected);
  });

  test('the run leaves a higher highest alone and moves a lower one', async () => {
    const world = new FakeWorld();
    world.highest.set('@venizia/ignis-kernel', '0.4.10-0');
    world.highest.set('@venizia/ignis-helpers', '0.4.5');
    await execute({ world, plan: entries('helpers', 'kernel') });

    expect(world.highest.get('@venizia/ignis-kernel')).toBe('0.4.10-0');
    expect(world.highest.get('@venizia/ignis-helpers')).toBe('0.4.6');
  });
});
