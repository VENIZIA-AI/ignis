import { describe, expect, test } from 'bun:test';
import { getError } from '@venizia/ignis-helpers/core';
import { rm } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `__dirname`, not `import.meta`: this package emits CommonJS.
const CONNECTORS_ROOT = join(__dirname, '../../..');

/**
 * `node:module`'s own list rather than a hand-written one: a bare `import ... from 'fs'` bundles
 * identically to `'node:fs'`, and the metafile records whichever spelling the source used.
 */
const BUILTIN_MODULE_NAMES = new Set(builtinModules);

const isBuiltinSpecifier = (opts: { specifier: string }): boolean => {
  const { specifier } = opts;
  const bareName = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier;
  return BUILTIN_MODULE_NAMES.has(bareName);
};

interface IMetafile {
  inputs: Record<string, { imports: Array<{ path: string; original?: string }> }>;
}

/**
 * The METAFILE, not the bundled text. `bun build --target=browser` never fails on a node builtin and
 * never leaves the specifier in its output - an unpolyfillable one is stubbed to an empty object and
 * the exit code stays 0 - so a text scan reports clean on the exact import that throws at load. The
 * module graph is the only place the specifier survives.
 */
const listBundledBuiltins = async (opts: { entry: string }): Promise<string[]> => {
  const { entry } = opts;
  const metafilePath = join(tmpdir(), `ignis-connectors-purity-${crypto.randomUUID()}.json`);

  // The CLI, not `Bun.build()`: the in-process bundler resolves this workspace's symlinked
  // dependencies to directories and dies on them.
  const proc = Bun.spawn(
    [
      'bun',
      'build',
      join(CONNECTORS_ROOT, entry),
      '--target=browser',
      '--format=esm',
      '--env=disable',
      `--metafile=${metafilePath}`,
    ],
    { cwd: CONNECTORS_ROOT, stdout: 'pipe', stderr: 'pipe' },
  );

  const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

  if (exitCode !== 0) {
    await rm(metafilePath, { force: true });
    throw getError({ message: `[listBundledBuiltins] Failed to bundle ${entry} | ${stderr}` });
  }

  try {
    const metafile = JSON.parse(await Bun.file(metafilePath).text()) as IMetafile;
    const builtins = new Set<string>();

    for (const [inputPath, input] of Object.entries(metafile.inputs)) {
      if (isBuiltinSpecifier({ specifier: inputPath })) {
        builtins.add(inputPath);
      }

      for (const dependency of input.imports) {
        const specifier = dependency.original ?? dependency.path;
        if (isBuiltinSpecifier({ specifier })) {
          builtins.add(specifier);
        }
      }
    }

    return [...builtins].sort();
  } finally {
    await rm(metafilePath, { force: true });
  }
};

/**
 * `@venizia/ignis-connectors/postgres` and `/sqlite` are published as browser-capable, and a browser
 * BFF imports them inside a Worker. A node builtin anywhere in either graph is not a lazy failure:
 * `hono/context-storage` - the module both user-audit enrichers used to import - runs
 * `new AsyncLocalStorage()` in its module body, so the Worker dies with
 * `AsyncLocalStorage is not a constructor` before a single route is registered.
 *
 * Probes `src/`, not `dist/`: `make purity` covers the published files, and this suite has to fail
 * on the source edit that reintroduces the import rather than on the next build.
 */
describe('relational sub-paths bundle clean for a browser', () => {
  test('the postgres tier pulls in no node builtin', async () => {
    expect(await listBundledBuiltins({ entry: 'src/relational/postgres/index.ts' })).toEqual([]);
  }, 120_000);

  test('the sqlite tier pulls in no node builtin', async () => {
    expect(await listBundledBuiltins({ entry: 'src/relational/sqlite/index.ts' })).toEqual([]);
  }, 120_000);
});
