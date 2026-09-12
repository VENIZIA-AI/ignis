import {
  BuildInfoEmitter,
  BuildInfoEnvironmentKeys,
  BuildInfoResolver,
  generateBuildInfo,
} from '@/build-info';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

/** Every key the resolver reads, so a key added later is cleaned up here without a second list. */
const ENV_KEYS = [
  ...BuildInfoEnvironmentKeys.VERSION,
  ...BuildInfoEnvironmentKeys.COMMIT,
  ...BuildInfoEnvironmentKeys.BRANCH,
  ...BuildInfoEnvironmentKeys.BUILT_AT,
];

/** `symbolic-ref` names the branch on every git, where `init --initial-branch` needs 2.28. */
const initRepository = async (opts: { root: string }): Promise<void> => {
  await Bun.$`git init -q .`.cwd(opts.root).quiet();
  await Bun.$`git symbolic-ref HEAD refs/heads/stamped`.cwd(opts.root).quiet();
};

const manifestRoot = (opts: { name: string; version: string }): string => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-build-info-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify(opts));
  return root;
};

/**
 * A CI runner exports `GITHUB_SHA`, `CI_COMMIT_SHA` and friends for real, and the resolver would
 * read them - so every key is cleared BEFORE each test, not only after, and the runner's own
 * values are put back once the file is done.
 */
const inherited = new Map(ENV_KEYS.map(key => [key, process.env[key]]));

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterAll(() => {
  for (const [key, value] of inherited) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('BuildInfoResolver.resolve', () => {
  test('the manifest supplies service and version when no CI variable does', async () => {
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });

    const info = await BuildInfoResolver.getInstance().resolve({ root });

    expect(info.service).toBe('@nx/sale');
    expect(info.version).toBe('1.4.2');
  });

  /** CI knows the release tag; the manifest inside the image does not. */
  test('APP_BUILD_VERSION wins over the manifest version', async () => {
    process.env.APP_BUILD_VERSION = 'v9.9.9';
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });

    expect((await BuildInfoResolver.getInstance().resolve({ root })).version).toBe('v9.9.9');
  });

  test('a provider-specific commit variable is read and shortened', async () => {
    process.env.CI_COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });

    expect((await BuildInfoResolver.getInstance().resolve({ root })).commit).toBe('0123456789ab');
  });

  test('APP_BUILD_COMMIT wins over a provider variable', async () => {
    process.env.CI_COMMIT_SHA = 'aaaaaaaaaaaa';
    process.env.APP_BUILD_COMMIT = 'bbbbbbbbbbbb';
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });

    expect((await BuildInfoResolver.getInstance().resolve({ root })).commit).toBe('bbbbbbbbbbbb');
  });

  /** The `APP_ENV_` prefix is what BANA's own pipeline already exports; it must outrank the rest. */
  test('APP_ENV_BUILD_VERSION outranks every other version variable', async () => {
    process.env.CI_COMMIT_TAG = 'from-ci';
    process.env.APP_BUILD_VERSION = 'from-app-build';
    process.env.APP_ENV_BUILD_VERSION = 'from-app-env';
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });

    expect((await BuildInfoResolver.getInstance().resolve({ root })).version).toBe('from-app-env');
  });

  test('APP_ENV_BUILD_COMMIT_TAG outranks every other commit variable, and is shortened', async () => {
    process.env.CI_COMMIT_SHA = 'aaaaaaaaaaaa';
    process.env.APP_BUILD_COMMIT = 'bbbbbbbbbbbb';
    process.env.APP_ENV_BUILD_COMMIT_TAG = '0123456789abcdef';
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });

    expect((await BuildInfoResolver.getInstance().resolve({ root })).commit).toBe('0123456789ab');
  });

  test('APP_ENV_BUILD_DATE outranks APP_BUILD_DATE', async () => {
    process.env.APP_BUILD_DATE = '2026-01-01T00:00:00.000Z';
    process.env.APP_ENV_BUILD_DATE = '2026-03-03T00:00:00.000Z';
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });

    expect((await BuildInfoResolver.getInstance().resolve({ root })).builtAt).toBe(
      '2026-03-03T00:00:00.000Z',
    );
  });

  /** A directory with no manifest and no git is exactly a Distroless image; it must not throw. */
  test('nothing to read anywhere: every unknown field reads "unspecified"', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ignis-build-info-bare-'));

    const info = await BuildInfoResolver.getInstance().resolve({ root });

    expect(info.service).toBe('unspecified');
    expect(info.version).toBe('unspecified');
    // `builtAt` is always knowable - it is the moment the generator ran.
    expect(info.builtAt).not.toBe('unspecified');
  });

  /** `JSON.parse` types nothing: a manifest with a numeric `name` must not put a number in the stamp. */
  test('a manifest whose fields are the wrong type is ignored field by field', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ignis-build-info-typed-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 42, version: '1.4.2' }));

    const info = await BuildInfoResolver.getInstance().resolve({ root });

    expect(info.service).toBe('unspecified');
    expect(info.version).toBe('1.4.2');
  });

  /**
   * `git` must be read from `root`, never from the process cwd - a monorepo build runs the CLI from
   * the workspace root while the stamp belongs to the package. A real repository is built here so
   * the assertion does not depend on this checkout having a `.git`.
   */
  test('the commit and branch come from a repository at root, not from the cwd', async () => {
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });
    await initRepository({ root });
    // `-c` overrides keep this independent of the machine's identity and signing configuration.
    await Bun.$`git -c user.email=a@b -c user.name=t -c commit.gpgsign=false commit -q --allow-empty -m seed`
      .cwd(root)
      .quiet();

    const info = await BuildInfoResolver.getInstance().resolve({ root });

    expect(info.commit).toMatch(/^[0-9a-f]{12}$/);
    expect(info.branch).toBe('stamped');
  });

  /**
   * A repository with no commit is the load-bearing case for reading `exitCode`: `git rev-parse
   * --abbrev-ref HEAD` prints the literal `HEAD` on stdout AND exits 128, so a resolver that only
   * looked at stdout would stamp the branch as `HEAD`.
   */
  test('a repository with no commit yet leaves both fields unspecified', async () => {
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });
    await initRepository({ root });

    const info = await BuildInfoResolver.getInstance().resolve({ root });

    expect(info.commit).toBe('unspecified');
    expect(info.branch).toBe('unspecified');
  });

  test('APP_BUILD_DATE pins builtAt, so a reproducible build stays reproducible', async () => {
    process.env.APP_BUILD_DATE = '2026-01-01T00:00:00.000Z';
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });

    expect((await BuildInfoResolver.getInstance().resolve({ root })).builtAt).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });
});

describe('BuildInfoEmitter.render', () => {
  const buildInfo = {
    service: '@nx/sale',
    version: '1.4.2',
    commit: 'abc123',
    branch: 'develop',
    builtAt: '2026-01-01T00:00:00.000Z',
  };

  test('ts output is a static const a bundler can bake into a compiled binary', async () => {
    const content = BuildInfoEmitter.render({ buildInfo, format: 'ts', exportName: 'BUILD_INFO' });

    expect(content).toContain('export const BUILD_INFO = {');
    expect(content).toContain('service: "@nx/sale",');
    expect(content).toContain('} as const;');
  });

  test('json output parses back to the same record, for a frontend or a Tauri shell', async () => {
    const content = BuildInfoEmitter.render({
      buildInfo,
      format: 'json',
      exportName: 'BUILD_INFO',
    });

    expect(JSON.parse(content)).toEqual(buildInfo);
  });
});

describe('generateBuildInfo', () => {
  test('it writes the file and creates its directory', async () => {
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });
    const out = join(root, 'nested', 'deeper', '_build_info.ts');

    const result = await generateBuildInfo({ out, root });

    expect(readFileSync(out, 'utf8')).toBe(result.content);
    expect(result.buildInfo.service).toBe('@nx/sale');
  });

  /** `builtAt` moves every run, so an unchanged-content short-circuit would hide a stale stamp. */
  test('a second run rewrites the file rather than skipping it', async () => {
    const root = manifestRoot({ name: '@nx/sale', version: '1.4.2' });
    const out = join(root, '_build_info.ts');

    process.env.APP_BUILD_DATE = '2026-01-01T00:00:00.000Z';
    const first = await generateBuildInfo({ out, root });

    process.env.APP_BUILD_DATE = '2026-02-02T00:00:00.000Z';
    const second = await generateBuildInfo({ out, root });

    expect(first.buildInfo.builtAt).toBe('2026-01-01T00:00:00.000Z');
    expect(second.buildInfo.builtAt).toBe('2026-02-02T00:00:00.000Z');
    expect(readFileSync(out, 'utf8')).toBe(second.content);
  });
});
