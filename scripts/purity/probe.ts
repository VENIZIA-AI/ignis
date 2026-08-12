import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface IPurityResult {
  entry: string;
  ok: boolean;
  sizeBytes: number;
  builtins: string[];
  globals: string[];
  buildError?: string;
}

/**
 * Node globals survive verbatim into a `target: 'browser'` bundle, so a gate reading only module
 * specifiers reports clean on `process.env.NODE_ENV`. Each pattern must be anchored: a bundle
 * legitimately contains identifiers like `processQueue`.
 */
const GLOBAL_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'process', pattern: /(?<![A-Za-z0-9_$.])process\s*\./ },
  { name: '__dirname', pattern: /(?<![A-Za-z0-9_$.])__dirname(?![A-Za-z0-9_$])/ },
  { name: '__filename', pattern: /(?<![A-Za-z0-9_$.])__filename(?![A-Za-z0-9_$])/ },
  { name: 'createRequire', pattern: /(?<![A-Za-z0-9_$.])createRequire\s*\(/ },
];

interface IMetafileImport {
  path: string;
  original?: string;
  external?: boolean;
}

interface IMetafileInput {
  imports: IMetafileImport[];
}

interface IMetafile {
  inputs: Record<string, IMetafileInput>;
}

/**
 * `node:module`'s own list, not a hand-maintained one: a bare `import ... from 'fs'` bundles
 * identically to `'node:fs'` (Bun stubs both to an empty object), and the metafile records
 * whichever spelling the source used. Matching by prefix alone misses the bare form entirely.
 */
const BUILTIN_MODULE_NAMES = new Set(builtinModules);

const isBuiltinSpecifier = (specifier: string): boolean => {
  const bareName = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier;
  return BUILTIN_MODULE_NAMES.has(bareName);
};

/**
 * Measured against Bun 1.3.14: `--target=browser` never fails on a `node:` import and never leaves
 * the specifier in the bundled text. An unpolyfillable builtin (`fs`, `child_process`, ...) is
 * stubbed to an empty object; a polyfillable one (`crypto`, `path`, ...) is inlined in full under a
 * `/bun-vfs$$/` virtual path. Either way `exitCode` stays 0 and the specifier never survives into
 * stdout. The `--metafile` module graph is the only place it is preserved.
 */
const findBuiltinSpecifiers = (metafile: IMetafile): string[] => {
  const builtins = new Set<string>();

  for (const [inputPath, input] of Object.entries(metafile.inputs)) {
    if (isBuiltinSpecifier(inputPath)) {
      builtins.add(inputPath);
    }

    for (const dependency of input.imports) {
      const specifier = dependency.original ?? dependency.path;
      if (isBuiltinSpecifier(specifier)) {
        builtins.add(specifier);
      }
    }
  }

  return [...builtins].sort();
};

/**
 * A real npm dependency bundles in full under this target (measured: `zod` produces zero
 * `external` entries) and a genuinely missing package fails the build outright (nonzero exit,
 * caught before this runs). But a package's own `browser` field can remap a dependency to `false` -
 * the standard convention for disabling a Node-only dependency in browser builds - and Bun honours
 * that remap by leaving the import external with exit 0, whether or not the remapped name is a
 * builtin. An unresolved import in a browser bundle is not safe to wave through either way.
 */
const findUnresolvedExternalSpecifiers = (opts: { metafile: IMetafile; builtins: Set<string> }): string[] => {
  const { metafile, builtins } = opts;
  const unresolved = new Set<string>();

  for (const input of Object.values(metafile.inputs)) {
    for (const dependency of input.imports) {
      if (!dependency.external) {
        continue;
      }

      const specifier = dependency.original ?? dependency.path;
      if (builtins.has(specifier)) {
        continue;
      }

      unresolved.add(specifier);
    }
  }

  return [...unresolved].sort();
};

/**
 * Reads and removes the metafile unconditionally. Returns `undefined` rather than throwing -
 * `probeEntry` reports on every entry it is given rather than aborting the run of the other five.
 */
const readMetafile = async (path: string): Promise<IMetafile | undefined> => {
  try {
    return JSON.parse(await Bun.file(path).text()) as IMetafile;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[purity] Failed to read the build metafile at ${path}: ${reason}`);
    return undefined;
  } finally {
    await rm(path, { force: true });
  }
};

/**
 * The CLI, not `Bun.build()`: the in-process bundler resolves this workspace's symlinked
 * dependencies to directories and dies on them.
 */
export const probeEntry = async (opts: { entry: string; cwd: string }): Promise<IPurityResult> => {
  const { entry, cwd } = opts;
  const metafilePath = join(tmpdir(), `ignis-purity-${randomUUID()}.json`);

  // `--env=disable`: Bun inlines `process.env.NODE_ENV` as a compile-time string constant by
  // default, regardless of whether the read is reachable. That erases the very read this probe
  // exists to catch, and the erasure depends on the ambient `NODE_ENV` the probe happens to run
  // under - the same failure shape as the undetected leak this gate was built to prevent.
  const proc = Bun.spawn(
    ['bun', 'build', entry, '--target=browser', '--format=esm', '--env=disable', `--metafile=${metafilePath}`],
    { cwd, stdout: 'pipe', stderr: 'pipe' },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    await rm(metafilePath, { force: true });
    return { entry, ok: false, sizeBytes: 0, builtins: [], globals: [], buildError: stderr.trim() };
  }

  const metafile = await readMetafile(metafilePath);
  if (!metafile) {
    return {
      entry,
      ok: false,
      sizeBytes: stdout.length,
      builtins: [],
      globals: [],
      buildError: 'Could not read the bun build metafile - the probe result is not trustworthy',
    };
  }

  const builtins = findBuiltinSpecifiers(metafile);
  const unresolvedExternals = findUnresolvedExternalSpecifiers({ metafile, builtins: new Set(builtins) });
  const globals = GLOBAL_PATTERNS.filter(g => g.pattern.test(stdout)).map(g => g.name);

  if (builtins.length > 0 || unresolvedExternals.length > 0) {
    const reasons: string[] = [];
    if (builtins.length > 0) {
      reasons.push(`node builtin import(s): ${builtins.join(', ')}`);
    }
    if (unresolvedExternals.length > 0) {
      reasons.push(`unresolved external import(s): ${unresolvedExternals.join(', ')}`);
    }

    return {
      entry,
      ok: false,
      sizeBytes: stdout.length,
      builtins,
      globals,
      buildError: reasons.join(' | '),
    };
  }

  return {
    entry,
    ok: globals.length === 0,
    sizeBytes: stdout.length,
    builtins,
    globals,
  };
};
