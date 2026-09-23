#!/usr/bin/env bun
/**
 * Loads every published sub-path the way a consumer's machine does: packed tarballs, installed into
 * an empty project, each package ALONE with its required peers plus the optional peers the manifest
 * grants that sub-path - under both the hoisted and the isolated linker.
 *
 * Four checks per sub-path: `import()` under Bun, `import()` and `require()` under Node, and a
 * `bun build --target=browser` for every entry the purity gate claims. Inside the workspace every
 * optional peer resolves, so a leak there is invisible; here it fails on the line that pulls it.
 *
 * Usage: bun scripts/clean-install/cli.ts [package ...] [--keep]
 */
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { PURITY_MANIFEST } from '../purity/manifest';
import {
  assertEveryPackageClaimed,
  deriveInstallRows,
  INSTALL_CLAIMS,
  listPublishedPackages,
  readPackageManifest,
} from './manifest';
import type { IInstallRow, IPackageManifest } from './manifest';

const REPOSITORY_ROOT = join(import.meta.dir, '../..');
const WORKSPACE_SCOPE = '@venizia/';
const LINKERS = ['hoisted', 'isolated'];
const TYPELESS_PACKAGE_WARNING = 'MODULE_TYPELESS_PACKAGE_JSON';

interface ICheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const run = async (opts: {
  command: string[];
  cwd: string;
}): Promise<{ ok: boolean; output: string }> => {
  const child = Bun.spawn(opts.command, { cwd: opts.cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { ok: status === 0, output: `${stderr}\n${stdout}` };
};

/** The line a reader needs: the first one naming what could not be found or loaded. */
const firstErrorLine = (opts: { output: string }): string => {
  const lines = opts.output.split('\n').map(line => line.trim());
  const found = lines.find(line =>
    /Cannot find|Could not resolve|not found|Error|error:/.test(line),
  );
  return (found ?? lines.find(line => line.length > 0) ?? '').slice(0, 200);
};

/**
 * Node and Bun resolve a bare specifier from every ANCESTOR `node_modules`, and Node's `require` also
 * from `NODE_PATH` and `~/.node_modules` / `~/.node_libraries`. Any of them sitting above the gate
 * root would satisfy a missing peer and pass a leak - so each one found is a reason not to start.
 */
export const findStrayModuleRoots = (opts: {
  root: string;
  home?: string;
  nodePath?: string;
}): string[] => {
  const found: string[] = [];

  let directory = dirname(opts.root);
  while (true) {
    const candidate = join(directory, 'node_modules');
    if (existsSync(candidate)) {
      found.push(candidate);
    }

    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }

  const home = opts.home;
  if (home) {
    const globalFolders = ['.node_modules', '.node_libraries'].map(name => join(home, name));
    found.push(...globalFolders.filter(folder => existsSync(folder)));
  }

  const nodePaths = (opts.nodePath ?? '').split(':').filter(path => path.length > 0);
  found.push(...nodePaths.map(path => `NODE_PATH=${path}`));

  return found;
};

/**
 * Every `@venizia/*` entry of a sandbox's `bun.lock` that does NOT resolve to the tarball packed for
 * it. A registry copy of the same version reads `"name@0.2.0-44", ""`; a packed one reads
 * `"name@/abs/path.tgz"`. The sandboxed package itself must be present, or nothing was checked.
 */
export const findUnpinnedWorkspaceEntries = (opts: {
  lock: string;
  tarballs: Map<string, string>;
  package: string;
}): string[] => {
  const parsed = Bun.JSONC.parse(opts.lock);
  const packages =
    typeof parsed === 'object' && parsed !== null && 'packages' in parsed ? parsed.packages : {};
  const problems: string[] = [];
  let sawPackage = false;

  const entries = typeof packages === 'object' && packages !== null ? Object.entries(packages) : [];
  for (const [key, value] of entries) {
    const resolution = Array.isArray(value) ? String(value[0]) : '';
    const at = resolution.indexOf('@', 1);
    const name = resolution.slice(0, at);
    if (!name.startsWith(WORKSPACE_SCOPE)) {
      continue;
    }

    sawPackage ||= name === opts.package;
    const spec = resolution.slice(at + 1);
    const tarball = opts.tarballs.get(name);
    if (!tarball || (spec !== tarball && spec !== `file:${tarball}`)) {
      problems.push(`${key} resolves to '${spec}', not the packed tarball`);
    }
  }

  if (!sawPackage) {
    problems.push(`${opts.package} is missing from bun.lock`);
  }

  return problems;
};

/**
 * Browser-claimed ESM entries no install row loads. The browser build runs only for an entry some
 * row's `import` target matches, so an unmatched one would be skipped without a word.
 */
export const findUnmatchedBrowserEntries = (opts: {
  browserEntries: string[];
  rowEntries: string[];
}): string[] => opts.browserEntries.filter(entry => !opts.rowEntries.includes(entry));

/**
 * True when the build is older than its source. The stamp is the newest file under `dist/`, not one
 * entry file: the build is incremental, so `tsc` re-emits only the files a change reaches.
 */
export const isBuildStale = (opts: { newestSourceMs: number; newestDistMs?: number }): boolean =>
  opts.newestDistMs === undefined || opts.newestSourceMs > opts.newestDistMs;

const newestFile = (opts: {
  directory: string;
  skip?: string;
}): { path: string; mtimeMs: number } | undefined => {
  if (!existsSync(opts.directory)) {
    return undefined;
  }

  let newest: { path: string; mtimeMs: number } | undefined;
  const files = readdirSync(opts.directory, { recursive: true, withFileTypes: true });
  for (const file of files) {
    if (!file.isFile()) {
      continue;
    }

    // A type-check pass rewrites `.tsbuildinfo` even when the emit after it fails, and it never ships.
    const path = join(file.parentPath, file.name);
    if (path.endsWith('.tsbuildinfo') || (opts.skip && path.includes(`/${opts.skip}/`))) {
      continue;
    }

    const { mtimeMs } = statSync(path);
    if (!newest || mtimeMs > newest.mtimeMs) {
      newest = { path, mtimeMs };
    }
  }

  return newest;
};

/** `make clean-install` does not build: a package whose `src/` moved on since its `dist/` fails here. */
const assertFreshBuild = (opts: { directories: string[] }): void => {
  const stale: string[] = [];

  for (const directory of opts.directories) {
    const packageDirectory = join(REPOSITORY_ROOT, 'packages', directory);
    const source = newestFile({ directory: join(packageDirectory, 'src'), skip: '__tests__' });
    const dist = newestFile({ directory: join(packageDirectory, 'dist') });
    if (source && isBuildStale({ newestSourceMs: source.mtimeMs, newestDistMs: dist?.mtimeMs })) {
      stale.push(`${directory} (${relative(REPOSITORY_ROOT, source.path)} is newer than dist/)`);
    }
  }

  if (stale.length > 0) {
    throw new Error(
      `[clean-install] stale build - run \`make build\` (or \`make <package>\`) first: ${stale.join(', ')}`,
    );
  }
};

const listPackageDirectories = (): string[] =>
  assertEveryPackageClaimed({ packages: listPublishedPackages(), claims: INSTALL_CLAIMS });

/** The package and every workspace package it reaches through dependencies or peers. */
const workspaceClosure = (opts: { directories: string[] }): string[] => {
  const byName = new Map<string, string>();
  const allDirectories = listPackageDirectories();
  for (const directory of allDirectories) {
    byName.set(readPackageManifest({ package: directory }).name, directory);
  }

  const reached = new Set<string>();
  const queue = [...opts.directories];
  while (queue.length > 0) {
    const directory = queue.pop()!;
    if (reached.has(directory)) {
      continue;
    }

    reached.add(directory);
    const manifest = readPackageManifest({ package: directory });
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ];
    for (const name of names) {
      const next = byName.get(name);
      if (next) {
        queue.push(next);
      }
    }
  }

  return [...reached];
};

const pack = async (opts: {
  directories: string[];
  into: string;
}): Promise<Map<string, string>> => {
  const tarballs = new Map<string, string>();

  for (const directory of opts.directories) {
    const packageDirectory = join(REPOSITORY_ROOT, 'packages', directory);
    const destination = join(opts.into, 'tarballs', directory);
    const packed = await run({
      command: ['bun', 'pm', 'pack', '--quiet', '--destination', destination],
      cwd: packageDirectory,
    });
    if (!packed.ok) {
      throw new Error(
        `[clean-install] bun pm pack failed in ${directory}: ${firstErrorLine(packed)}`,
      );
    }

    const produced = readdirSync(destination).filter(file => file.endsWith('.tgz'));
    if (produced.length !== 1) {
      throw new Error(
        `[clean-install] expected one tarball for ${directory}, found ${produced.length}`,
      );
    }

    tarballs.set(readPackageManifest({ package: directory }).name, join(destination, produced[0]));
  }

  return tarballs;
};

const requiredPeers = (opts: { manifest: IPackageManifest }): Record<string, string> => {
  const { manifest } = opts;
  const optional = manifest.peerDependenciesMeta ?? {};
  const peers = Object.entries(manifest.peerDependencies ?? {}).filter(
    ([name]) => !optional[name]?.optional,
  );
  return Object.fromEntries(peers);
};

/** Entry file (repo-relative) -> the externals the purity gate grants it, for browser-claimed entries. */
const browserClaims = (): Map<string, string[]> =>
  new Map(
    PURITY_MANIFEST.filter(entry => !entry.expectImpure).map(entry => [
      entry.entry,
      entry.external ?? [],
    ]),
  );

/** Browser-claimed entries a browser bundler picks: the `import` target of some sub-path. */
const browserEsmEntries = (opts: { packages: string[] }): string[] =>
  PURITY_MANIFEST.filter(entry => !entry.expectImpure && opts.packages.includes(entry.package))
    .map(entry => entry.entry)
    .filter(entry =>
      opts.packages.some(directory =>
        Object.values(readPackageManifest({ package: directory }).exports ?? {}).some(
          target =>
            typeof target === 'object' &&
            target.import !== undefined &&
            join('packages', directory, target.import) === entry,
        ),
      ),
    );

/** Repository-relative file a row's `import()` loads. */
const rowEntry = (opts: { row: IInstallRow }): string | undefined => {
  const target = readPackageManifest({ package: opts.row.package }).exports?.[opts.row.subpath];
  const file = typeof target === 'string' ? target : (target?.import ?? target?.default);
  return file ? join('packages', opts.row.package, file) : undefined;
};

const checkRow = async (opts: {
  row: IInstallRow;
  sandbox: string;
  browser: Map<string, string[]>;
}): Promise<ICheckResult[]> => {
  const { row, sandbox, browser } = opts;
  const checks: Array<Promise<ICheckResult>> = [];

  const attempt = async (name: string, command: string[]): Promise<ICheckResult> => {
    const result = await run({ command, cwd: sandbox });
    // Node loads an unmarked `.js` as CommonJS, fails, then parses it again as ESM: it works, costs a
    // second parse per file, and prints this warning into every consumer's log.
    if (result.ok && result.output.includes(TYPELESS_PACKAGE_WARNING)) {
      return {
        name,
        ok: false,
        detail: `${TYPELESS_PACKAGE_WARNING}: dist/esm carries no "type": "module"`,
      };
    }
    return { name, ok: result.ok, detail: result.ok ? '' : firstErrorLine(result) };
  };

  checks.push(attempt('bun', ['bun', '-e', `await import('${row.specifier}')`]));

  if (!row.bunOnly) {
    checks.push(
      attempt('node-esm', [
        'node',
        '--input-type=module',
        '-e',
        `await import('${row.specifier}')`,
      ]),
    );
    if (row.hasRequire) {
      checks.push(attempt('node-cjs', ['node', '-e', `require('${row.specifier}')`]));
    }
  }

  const entryPath = rowEntry({ row });
  const externals = entryPath ? browser.get(entryPath) : undefined;
  if (externals) {
    const entryFile = join(sandbox, `entry-${row.subpath.replace(/[^a-z0-9]/gi, '_')}.ts`);
    writeFileSync(
      entryFile,
      `import * as loaded from '${row.specifier}';\nconsole.log(Object.keys(loaded).length);\n`,
    );
    const externalFlags = externals.flatMap(name => ['--external', name]);
    checks.push(
      attempt('browser', [
        'bun',
        'build',
        relative(sandbox, entryFile),
        '--target=browser',
        '--outdir',
        join(sandbox, 'browser-out'),
        ...externalFlags,
      ]),
    );
  }

  return Promise.all(checks);
};

const main = async (): Promise<number> => {
  const args = process.argv.slice(2);
  const keep = args.includes('--keep');
  const tokens = args.filter(arg => !arg.startsWith('--'));

  const nodeVersion = await run({ command: ['node', '--version'], cwd: REPOSITORY_ROOT });
  if (!nodeVersion.ok) {
    throw new Error(
      '[clean-install] `node` is not on PATH - the Node checks cannot run, and skipping them would pass for the wrong reason',
    );
  }

  const claims =
    tokens.length > 0
      ? INSTALL_CLAIMS.filter(claim => tokens.includes(claim.package))
      : INSTALL_CLAIMS;
  if (claims.length === 0) {
    throw new Error(`[clean-install] no claim matches ${tokens.join(', ')}`);
  }

  const rows = deriveInstallRows({ claims });
  const rowPackages = [...new Set(rows.map(row => row.package))];
  if (rowPackages.length === 0) {
    console.log('[clean-install] no runtime sub-path to load for this package - nothing to check.');
    return 0;
  }

  const unmatched = findUnmatchedBrowserEntries({
    browserEntries: browserEsmEntries({ packages: rowPackages }),
    rowEntries: rows.flatMap(row => rowEntry({ row }) ?? []),
  });
  if (unmatched.length > 0) {
    throw new Error(
      `[clean-install] browser-claimed ESM entries no row loads, so their browser build would be skipped: ${unmatched.join(', ')}`,
    );
  }

  const directories = workspaceClosure({ directories: rowPackages });
  assertFreshBuild({ directories });

  const root = mkdtempSync(join(tmpdir(), 'ignis-clean-install-'));
  const failures: string[] = [];
  let checkCount = 0;

  try {
    const strayRoots = findStrayModuleRoots({
      root,
      home: process.env.HOME,
      nodePath: process.env.NODE_PATH,
    });
    if (strayRoots.length > 0) {
      throw new Error(
        `[clean-install] module roots outside the sandboxes would satisfy a missing peer - remove them first: ${strayRoots.join(', ')}`,
      );
    }

    const tarballs = await pack({ directories, into: root });
    const overrides = Object.fromEntries(
      [...tarballs].map(([name, file]) => [name, `file:${file}`]),
    );
    const browser = browserClaims();

    // One sandbox per package, linker and set of granted peers: rows that need the same install share it.
    const groups = new Map<string, IInstallRow[]>();
    for (const row of rows) {
      for (const linker of LINKERS) {
        const key = `${row.package}|${linker}|${row.extras.join(',')}`;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
    }

    const groupEntries = [...groups];
    for (const [key, groupRows] of groupEntries) {
      const [directory, linker, extrasText] = key.split('|');
      const manifest = readPackageManifest({ package: directory });
      const extras = extrasText ? extrasText.split(',') : [];
      const peerRanges = manifest.peerDependencies ?? {};

      const sandbox = mkdtempSync(join(root, `${directory}-${linker}-`));
      const dependencies = {
        [manifest.name]: `file:${tarballs.get(manifest.name)}`,
        ...requiredPeers({ manifest }),
        ...Object.fromEntries(extras.map(name => [name, peerRanges[name]])),
      };
      writeFileSync(
        join(sandbox, 'package.json'),
        JSON.stringify(
          { name: 'clean-install-sandbox', private: true, dependencies, overrides },
          null,
          2,
        ),
      );

      const installed = await run({
        command: ['bun', 'install', `--linker=${linker}`],
        cwd: sandbox,
      });
      if (!installed.ok) {
        failures.push(
          `${manifest.name} (${linker}, +${extras.join(' ') || 'none'}) install: ${firstErrorLine(installed)}`,
        );
        continue;
      }

      // `overrides` is what swaps each registry `@venizia/*` for its tarball; if bun ever stops
      // honouring it, the same version comes from the registry and every check tests the wrong code.
      const unpinned = findUnpinnedWorkspaceEntries({
        lock: await Bun.file(join(sandbox, 'bun.lock')).text(),
        tarballs,
        package: manifest.name,
      });
      checkCount += 1;
      for (const problem of unpinned) {
        failures.push(`${manifest.name} [${linker}] lock-pin: ${problem}`);
      }

      // Node prints the typeless-package warning only OUTSIDE node_modules, so a consumer never sees it
      // while paying the second parse - the marker file is checked directly instead.
      const exportsImportIntoEsm = Object.values(manifest.exports ?? {}).some(
        target => typeof target === 'object' && target.import?.startsWith('./dist/esm/'),
      );
      if (exportsImportIntoEsm) {
        const markerPath = join(
          sandbox,
          'node_modules',
          manifest.name,
          'dist',
          'esm',
          'package.json',
        );
        const marker: { type?: string } = await Bun.file(markerPath)
          .json()
          .catch(() => ({}));
        checkCount += 1;
        if (marker.type !== 'module') {
          failures.push(
            `${manifest.name} [${linker}] esm-marker: dist/esm/package.json does not declare "type": "module"`,
          );
        }
      }

      for (const row of groupRows) {
        const results = await checkRow({ row, sandbox, browser });
        checkCount += results.length;
        const failed = results.filter(result => !result.ok);
        const marks = results
          .map(result => `${result.name} ${result.ok ? 'ok' : 'FAIL'}`)
          .join('  ');
        console.log(
          `  ${failed.length ? '✗' : '✓'} ${row.specifier.padEnd(48)} ${linker.padEnd(8)} ${marks}`,
        );
        for (const result of failed) {
          failures.push(`${row.specifier} [${linker}] ${result.name}: ${result.detail}`);
        }
      }
    }
  } finally {
    if (keep) {
      console.log(`\n[clean-install] sandboxes kept at ${root}`);
    } else {
      rmSync(root, { recursive: true, force: true });
    }
  }

  if (failures.length > 0) {
    console.error(`\n[clean-install] ${failures.length} of ${checkCount} checks failed:`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    return 1;
  }

  console.log(`\n[clean-install] ${checkCount} checks passed across ${rows.length} sub-paths.`);
  return 0;
};

if (import.meta.main) {
  process.exit(await main());
}
