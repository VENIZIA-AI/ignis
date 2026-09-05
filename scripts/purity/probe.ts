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
  /** Node-global reads that cannot throw in a browser. Reported, never fatal. */
  guardedGlobals: string[];
  /**
   * Specifiers this probe run excluded from its own module graph. Always echoed back, on both the
   * passing and failing path - an entry that externalises something is measuring less than an entry
   * that does not, and that must stay visible next to the result, not be a silent input.
   */
  external: string[];
  buildError?: string;
}

/**
 * Node globals survive verbatim into a `target: 'browser'` bundle, so a gate reading only module
 * specifiers reports clean on `process.env.NODE_ENV`. Each pattern must be anchored: a bundle
 * legitimately contains identifiers like `processQueue`. A lookbehind that rejects a preceding dot
 * also rejects `globalThis.process`, so every access path needs its own pattern.
 *
 * `severity` separates a read that throws from one that cannot. Optional chaining is not itself the
 * difference: `process?.env` throws a ReferenceError when `process` is a free identifier, while
 * `globalThis.process?.env` is an ordinary property read on an object that always exists.
 *
 * `guarded` means "reported, never fatal". Bare `process?.` sits there because this probe matches
 * bundled text and has no scope information: hono's `getColorEnabled` writes
 * `const { process, Deno } = globalThis;` and then `process?.env`, which is a local binding and
 * perfectly safe, and no regex can tell that apart from a free global. Failing on it would make the
 * gate cry wolf on a dependency; the unguarded `process.` and `globalThis.process.` forms stay
 * fatal, and those are the ones that are unambiguously browser-breaking.
 *
 * Exported for `probe.test.ts` to assert against directly, alongside {@link stripBundlerPathComments}.
 */
export const GLOBAL_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  severity: 'error' | 'guarded';
}> = [
  { name: 'process', pattern: /(?<![A-Za-z0-9_$.])process\s*\./, severity: 'error' },
  { name: 'process?.', pattern: /(?<![A-Za-z0-9_$.])process\s*\?\./, severity: 'guarded' },
  {
    name: 'globalThis.process',
    pattern: /(?<![A-Za-z0-9_$.])globalThis\s*\.\s*process\s*\./,
    severity: 'error',
  },
  {
    name: 'globalThis.process?.',
    pattern: /(?<![A-Za-z0-9_$.])globalThis\s*\.\s*process\s*\?\./,
    severity: 'guarded',
  },
  {
    name: '__dirname',
    pattern: /(?<![A-Za-z0-9_$.])__dirname(?![A-Za-z0-9_$])/,
    severity: 'error',
  },
  {
    name: '__filename',
    pattern: /(?<![A-Za-z0-9_$.])__filename(?![A-Za-z0-9_$])/,
    severity: 'error',
  },
  {
    name: 'createRequire',
    pattern: /(?<![A-Za-z0-9_$.])createRequire\s*\(/,
    severity: 'error',
  },
  { name: 'require(', pattern: /(?<![A-Za-z0-9_$.])require\s*\(/, severity: 'error' },
  // Member access only. `typeof Bun !== 'undefined'` is the legitimate runtime probe and never
  // throws; `Bun.serve(...)` in a browser does.
  { name: 'Bun', pattern: /(?<![A-Za-z0-9_$.])Bun\s*\./, severity: 'error' },
];

/**
 * Bun's bundler prefixes every CommonJS-wrapped module with a full-line `// <path>.js` header (this
 * whole workspace emits CJS `dist/*.js` - no package declares `"type": "module"`). A source path is
 * free-form and can legitimately contain `process` as a substring with no identifier boundary on
 * its left, e.g. this gate's own `transport/in-process.js`: the header reads
 * `// packages/core-worker/dist/transport/in-process.js`, and `process.` there is a filename
 * fragment, not a read of the global. `GLOBAL_PATTERNS` matches bundled TEXT with no scope
 * information, so it cannot tell a path comment from code - stripped before matching.
 */
const BUNDLER_PATH_COMMENT = /^\/\/ [\w@./-]+\.(?:c|m)?js$/gm;

/**
 * Exported so `probe.test.ts` can assert against the literal collision string directly, without
 * spawning `bun build` - a fixture whose OWN entry-path comment happens to reproduce the collision
 * is not something a filename choice can be relied on to keep reproducing.
 */
export const stripBundlerPathComments = (text: string): string => {
  return text.replace(BUNDLER_PATH_COMMENT, '');
};

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
 * builtin. An unresolved import in a browser bundle is not safe to wave through either way -
 * UNLESS the manifest entry asked for exactly this specifier via `external`, in which case its
 * presence here is the requested exclusion working, not a leak.
 */
/**
 * A relative specifier is the package's own file, and a truly unreachable one fails the build with a
 * nonzero exit, which is caught before this runs. Bun's METAFILE nonetheless marks a re-export of the
 * form `export { name } from './x.js'` as `external` while inlining it - measured on
 * `helpers/dist/esm/core.js`: six such specifiers reported external, `Bundled 192 modules`, and the
 * output contains `class BaseHelper` with no bare relative import left in it. Reading the metafile
 * literally there reports a leak the bundle does not have.
 */
const isRelativeSpecifier = (specifier: string): boolean => {
  return specifier.startsWith('./') || specifier.startsWith('../');
};

const findUnresolvedExternalSpecifiers = (opts: {
  metafile: IMetafile;
  builtins: Set<string>;
  requestedExternal: Set<string>;
}): string[] => {
  const { metafile, builtins, requestedExternal } = opts;
  const unresolved = new Set<string>();

  const isRequestedExternal = (specifier: string): boolean => {
    for (const requested of requestedExternal) {
      if (specifier === requested || specifier.startsWith(`${requested}/`)) {
        return true;
      }
    }
    return false;
  };

  for (const input of Object.values(metafile.inputs)) {
    for (const dependency of input.imports) {
      if (!dependency.external) {
        continue;
      }

      const specifier = dependency.original ?? dependency.path;
      if (
        isRelativeSpecifier(specifier) ||
        builtins.has(specifier) ||
        isRequestedExternal(specifier)
      ) {
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
export const probeEntry = async (opts: {
  entry: string;
  cwd: string;
  external?: string[];
}): Promise<IPurityResult> => {
  const { entry, cwd, external = [] } = opts;
  const metafilePath = join(tmpdir(), `ignis-purity-${randomUUID()}.json`);

  // `--env=disable`: Bun inlines `process.env.NODE_ENV` as a compile-time string constant by
  // default, regardless of whether the read is reachable. That erases the very read this probe
  // exists to catch, and the erasure depends on the ambient `NODE_ENV` the probe happens to run
  // under - the same failure shape as the undetected leak this gate was built to prevent.
  const externalArgs = external.flatMap(specifier => ['--external', specifier]);
  const proc = Bun.spawn(
    [
      'bun',
      'build',
      entry,
      '--target=browser',
      '--format=esm',
      '--env=disable',
      `--metafile=${metafilePath}`,
      ...externalArgs,
    ],
    { cwd, stdout: 'pipe', stderr: 'pipe' },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    await rm(metafilePath, { force: true });
    return {
      entry,
      ok: false,
      sizeBytes: 0,
      builtins: [],
      globals: [],
      guardedGlobals: [],
      external,
      buildError: stderr.trim(),
    };
  }

  const metafile = await readMetafile(metafilePath);
  if (!metafile) {
    return {
      entry,
      ok: false,
      sizeBytes: stdout.length,
      builtins: [],
      globals: [],
      guardedGlobals: [],
      external,
      buildError: 'Could not read the bun build metafile - the probe result is not trustworthy',
    };
  }

  const builtins = findBuiltinSpecifiers(metafile);
  const unresolvedExternals = findUnresolvedExternalSpecifiers({
    metafile,
    builtins: new Set(builtins),
    requestedExternal: new Set(external),
  });
  const scannableText = stripBundlerPathComments(stdout);
  const matched = GLOBAL_PATTERNS.filter(g => g.pattern.test(scannableText));
  const globals = matched.filter(g => g.severity === 'error').map(g => g.name);
  const guardedGlobals = matched.filter(g => g.severity === 'guarded').map(g => g.name);

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
      guardedGlobals,
      external,
      buildError: reasons.join(' | '),
    };
  }

  return {
    entry,
    ok: globals.length === 0,
    sizeBytes: stdout.length,
    builtins,
    globals,
    guardedGlobals,
    external,
  };
};
