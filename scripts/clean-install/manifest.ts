import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What a published sub-path may need beyond its package's own dependencies and REQUIRED peers.
 *
 * The gate installs each package alone into an empty project, adds exactly the peers listed here
 * for a sub-path, and loads it. A sub-path with no line here must load with no optional peer at all -
 * that default is the point: `@venizia/ignis-kernel/repository` pulled `@hono/zod-openapi` through a
 * barrel, and only an install without hono could show it.
 *
 * A granted peer brings its OWN required peers: granting `@hono/zod-openapi` also installs `hono`.
 * So the gate cannot see a leak of such a transitive peer into the entry it was granted to.
 */
export interface IInstallClaim {
  /** Directory under `packages/`, and the token `bun scripts/clean-install/cli.ts <token>` filters on. */
  package: string;
  /** Optional peers a sub-path needs, keyed as spelled in `exports`. Each must be a declared peer. */
  requires?: Record<string, string[]>;
  /** Sub-paths that exist for one runtime only, keyed as spelled in `exports`. */
  bunOnly?: string[];
  /**
   * Granted or required peers an application imports itself right AFTER a sub-path, keyed as
   * spelled in `exports`. Bun loads both from one ESM entry, in that order: a CommonJS sub-path that
   * `require`s a peer Bun is still loading as ESM crashes only then, never when loaded alone.
   */
  importedAfter?: Record<string, string[]>;
  /** Published for config files a tool reads, never imported at runtime - so it gets no row. */
  configOnly?: boolean;
}

const RELATIONAL = ['drizzle-orm', 'drizzle-zod', 'hono', '@hono/zod-openapi'];
const HTTP_LAYER = ['hono', '@hono/zod-openapi'];

export const INSTALL_CLAIMS: IInstallClaim[] = [
  { package: 'inversion' },
  { package: 'filter' },
  {
    package: 'helpers',
    requires: {
      './socket-io': ['socket.io', '@socket.io/redis-adapter', '@socket.io/redis-emitter'],
      './mqtt': ['mqtt'],
      './minio': ['minio'],
      './axios': ['axios'],
      './cron': ['cron'],
      './kafka': ['@platformatic/kafka'],
      './winston': ['winston', 'winston-daily-rotate-file', 'winston-transport'],
      './pino': ['pino'],
    },
    bunOnly: ['./bun-s3'],
  },
  { package: 'boot' },
  {
    package: 'kernel',
    // The root is the server kernel - controllers and routing. `./metadata` and `./repository` are
    // the entries a browser or a non-HTTP caller takes, and they need neither.
    requires: { '.': HTTP_LAYER },
  },
  {
    package: 'connectors',
    requires: {
      '.': RELATIONAL,
      './relational': RELATIONAL,
      './postgres': RELATIONAL,
      './postgres/node-postgres': ['drizzle-orm', 'pg'],
      './postgres/postgres-js': ['drizzle-orm', 'postgres'],
      './postgres/pglite': ['drizzle-orm', '@electric-sql/pglite'],
      './postgres/supabase': ['drizzle-orm'],
      './sqlite': RELATIONAL,
      './sqlite/libsql': [...RELATIONAL, '@libsql/client'],
      './search/controllers': HTTP_LAYER,
      './typesense': ['typesense'],
      './typesense/controllers': HTTP_LAYER,
      './meilisearch': ['meilisearch'],
    },
  },
  { package: 'core-worker' },
  {
    package: 'core-server',
    requires: {
      './postgres/node-postgres': ['pg'],
      './postgres/postgres-js': ['postgres'],
      './postgres/pglite': ['@electric-sql/pglite'],
      './sqlite/libsql': ['@libsql/client'],
      './meilisearch': ['meilisearch'],
      './typesense': ['typesense'],
      './socket-io': ['socket.io', '@socket.io/redis-adapter', '@socket.io/redis-emitter'],
    },
    importedAfter: { '.': ['jose'], './postgres/postgres-js': ['postgres'] },
  },
  { package: 'atlas' },
  { package: 'dev-configs', configOnly: true },
];

export interface IPackageManifest {
  name: string;
  exports?: Record<string, string | Record<string, string>>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

export interface IPublishedPackage {
  directory: string;
  private: boolean;
}

export interface IInstallRow {
  package: string;
  name: string;
  subpath: string;
  specifier: string;
  extras: string[];
  bunOnly: boolean;
  hasRequire: boolean;
  importedAfter: string[];
}

const REPOSITORY_ROOT = join(import.meta.dir, '../..');

export const readPackageManifest = (opts: { package: string }): IPackageManifest =>
  JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'packages', opts.package, 'package.json'), 'utf8'));

/** Every directory under `packages/` with a `package.json`, and whether npm would publish it. */
export const listPublishedPackages = (): IPublishedPackage[] =>
  readdirSync(join(REPOSITORY_ROOT, 'packages'))
    .filter(directory => existsSync(join(REPOSITORY_ROOT, 'packages', directory, 'package.json')))
    .map(directory => ({
      directory,
      private:
        JSON.parse(
          readFileSync(join(REPOSITORY_ROOT, 'packages', directory, 'package.json'), 'utf8'),
        ).private === true,
    }));

/**
 * A published package with no claim would get no check and drop out of the override closure, so it
 * would be tested nowhere - every one must carry a claim, even an empty `configOnly` one.
 */
export const assertEveryPackageClaimed = (opts: {
  packages: IPublishedPackage[];
  claims: IInstallClaim[];
}): string[] => {
  const published = opts.packages.filter(entry => !entry.private).map(entry => entry.directory);
  const unclaimed = published.filter(
    directory => !opts.claims.some(claim => claim.package === directory),
  );
  if (unclaimed.length > 0) {
    throw new Error(
      `[clean-install][manifest] published packages with no claim in INSTALL_CLAIMS: ${unclaimed.join(', ')}`,
    );
  }

  return published;
};

/** Peers not marked optional, with their ranges: the gate installs them beside every sub-path of the package. */
export const getRequiredPeers = (opts: { manifest: IPackageManifest }): Record<string, string> => {
  const optional = opts.manifest.peerDependenciesMeta ?? {};
  const peers = Object.entries(opts.manifest.peerDependencies ?? {}).filter(
    ([name]) => !optional[name]?.optional,
  );
  return Object.fromEntries(peers);
};

/** A runtime entry: not the manifest itself, not a JSON config, not a pattern. */
const isCodeSubpath = (subpath: string): boolean =>
  subpath !== './package.json' && !subpath.endsWith('.json') && !subpath.includes('*');

/**
 * Rows come from each package's own `exports` map, never a hand-written list, so a sub-path is
 * gated the moment it is published. A claim naming a sub-path or a peer that does not exist fails
 * here rather than silently gating nothing.
 */
export const deriveInstallRows = (opts: { claims: IInstallClaim[] }): IInstallRow[] => {
  const rows: IInstallRow[] = [];

  const runtimeClaims = opts.claims.filter(claim => !claim.configOnly);
  for (const claim of runtimeClaims) {
    const manifest = readPackageManifest({ package: claim.package });
    const exportsMap = manifest.exports ?? {};
    const peers = manifest.peerDependencies ?? {};

    const claimedSubpaths = [
      ...Object.keys(claim.requires ?? {}),
      ...(claim.bunOnly ?? []),
      ...Object.keys(claim.importedAfter ?? {}),
    ];
    for (const subpath of claimedSubpaths) {
      if (!(subpath in exportsMap)) {
        throw new Error(
          `[clean-install][manifest] '${claim.package}' names '${subpath}', which its exports map does not publish`,
        );
      }
    }

    const requiredEntries = Object.entries(claim.requires ?? {});
    for (const [subpath, extras] of requiredEntries) {
      for (const extra of extras) {
        if (!(extra in peers)) {
          throw new Error(
            `[clean-install][manifest] '${claim.package}${subpath.slice(1)}' requires '${extra}', which '${manifest.name}' does not declare as a peer`,
          );
        }
      }
    }

    // Only a granted or a required peer is installed beside the sub-path; any other would fail as missing.
    const requiredPeers = getRequiredPeers({ manifest });
    const importOrderEntries = Object.entries(claim.importedAfter ?? {});
    for (const [subpath, importedPeers] of importOrderEntries) {
      for (const peer of importedPeers) {
        const isGranted = (claim.requires?.[subpath] ?? []).includes(peer);
        if (!isGranted && !(peer in requiredPeers)) {
          throw new Error(
            `[clean-install][manifest] '${claim.package}${subpath.slice(1)}' is imported before '${peer}', which the claim does not grant that sub-path`,
          );
        }
      }
    }

    const subpaths = Object.keys(exportsMap).filter(isCodeSubpath);
    for (const subpath of subpaths) {
      const target = exportsMap[subpath];
      rows.push({
        package: claim.package,
        name: manifest.name,
        subpath,
        specifier: subpath === '.' ? manifest.name : `${manifest.name}${subpath.slice(1)}`,
        extras: [...(claim.requires?.[subpath] ?? [])].sort(),
        bunOnly: (claim.bunOnly ?? []).includes(subpath),
        hasRequire: typeof target === 'string' || 'require' in target || 'default' in target,
        importedAfter: [...(claim.importedAfter?.[subpath] ?? [])],
      });
    }
  }

  return rows;
};
