import { RpcError, RpcErrorCodes } from '@/protocol/common';
import type { IToolHandler } from '@/protocol/common';
import { toPackageDirectory } from '@/releases';
import type { ReleaseStore } from '@/releases';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { parseInput, VersionInputSchema } from './common';

const DESCRIPTION =
  'Compare the @venizia/* packages installed in a directory against the newest versions this ' +
  'build knows about - the versions its generated release table carries, not the registry.';

// Built once at module load - a guarded tool that re-resolves its store on every call never needs
// to rebuild this.
const INPUT_JSON_SCHEMA = z.toJSONSchema(VersionInputSchema);

const SCOPE_PREFIX = '@venizia/';

// An exact version, not a range: `^0.2.0-11` and `>=1` name a set of versions, `0.2.0-11` names one.
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

interface IManifest {
  version?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface IBehindRow {
  package: string;
  installed: string;
  newest: string;
}

interface IVersionResponse {
  installed: Record<string, string | null>;
  snapshot: Record<string, string>;
  behind: IBehindRow[];
}

/** `undefined` when the file is absent; a file that exists but does not parse is named, never skipped. */
const readManifest = (opts: { file: string }): IManifest | undefined => {
  if (!existsSync(opts.file)) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(opts.file, 'utf8'));
  } catch {
    throw new RpcError({
      code: RpcErrorCodes.INVALID_PARAMS,
      message: `unreadable package.json: ${opts.file}`,
    });
  }
};

/** Every `@venizia/*` dependency the manifest declares, runtime and development alike, sorted. */
const declaredOf = (opts: { manifest?: IManifest }): [string, string][] => {
  const declared = {
    ...(opts.manifest?.dependencies ?? {}),
    ...(opts.manifest?.devDependencies ?? {}),
  };

  return Object.entries(declared)
    .filter(([name]) => name.startsWith(SCOPE_PREFIX))
    .sort(([left], [right]) => (left < right ? -1 : 1));
};

/**
 * The version actually on disk, else the declared spec when it is one exact version, else `null`.
 * A range is never a version - reporting `^0.2.0-11` as installed would invent a fact.
 */
const installedVersionOf = (opts: { cwd: string; name: string; spec: string }): string | null => {
  const manifest = readManifest({
    file: join(opts.cwd, 'node_modules', opts.name, 'package.json'),
  });
  if (typeof manifest?.version === 'string' && manifest.version.length > 0) {
    return manifest.version;
  }

  return EXACT_VERSION_PATTERN.test(opts.spec) ? opts.spec : null;
};

/** The newest version this build knows for every package in its table. */
const snapshotOf = (opts: { releases: ReleaseStore; live: string[] }): Record<string, string> => {
  const snapshot: Record<string, string> = {};

  for (const name of opts.releases.packages().filter(candidate => opts.live.includes(candidate))) {
    const newest = opts.releases.newestOf({ package: name });
    if (newest) {
      snapshot[name] = newest.version;
    }
  }

  return snapshot;
};

/**
 * One row per package whose installed version orders below the newest known one. An installed
 * version that never resolved, or a version neither side can parse, is skipped - never guessed.
 */
const behindOf = (opts: {
  installed: Record<string, string | null>;
  snapshot: Record<string, string>;
}): IBehindRow[] => {
  const rows: IBehindRow[] = [];

  for (const [name, version] of Object.entries(opts.installed)) {
    const directory = toPackageDirectory(name);
    const newest = opts.snapshot[directory];
    if (version === null || newest === undefined) {
      continue;
    }

    if (!EXACT_VERSION_PATTERN.test(version) || !EXACT_VERSION_PATTERN.test(newest)) {
      continue;
    }

    if (Bun.semver.order(version, newest) < 0) {
      rows.push({ package: directory, installed: version, newest });
    }
  }

  return rows;
};

export const buildVersionTool = (opts: { releases: ReleaseStore }): IToolHandler => ({
  definition: {
    name: 'version',
    description: DESCRIPTION,
    inputSchema: INPUT_JSON_SCHEMA,
  },
  call: async ({ args }) => {
    const input = parseInput({ schema: VersionInputSchema, args });

    if (opts.releases.isEmpty()) {
      throw new RpcError({
        code: RpcErrorCodes.INVALID_PARAMS,
        message: 'no release table in this build',
      });
    }

    const cwd = input.cwd ?? process.cwd();
    const manifest = readManifest({ file: join(cwd, 'package.json') });

    const installed: Record<string, string | null> = {};
    const declared = declaredOf({ manifest });
    for (const [name, spec] of declared) {
      installed[name] = installedVersionOf({ cwd, name, spec });
    }

    const snapshot = snapshotOf({ releases: opts.releases, live: opts.releases.livePackages() });
    const response: IVersionResponse = {
      installed,
      snapshot,
      behind: behindOf({ installed, snapshot }),
    };

    return response;
  },
});
