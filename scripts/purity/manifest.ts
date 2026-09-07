import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface IPurityEntry {
  label: string;
  package: string;
  /** Repository-relative path to the built file the `exports` map points at. */
  entry: string;
  /**
   * Specifiers to pass through as `bun build --external`. Only for a third-party dependency whose
   * OWN packaging is out of this gate's remit - e.g. one that relies on its `package.json` `browser`
   * field remap, which the downstream app's bundler (Vite, ...) honours and `bun build` does not.
   * Never for IGNIS's own source: an external hides that file from the module graph entirely, so
   * using it on our own code would let a real leak through unseen rather than prove anything pure.
   * Enforced below, not left to this comment alone - see `assertNoWorkspaceExternal`.
   */
  external?: string[];
  /**
   * This row is EXPECTED to be impure, so failing is its passing state. Derived from
   * {@link IPurityClaim.impure} - never authored on a row directly.
   */
  expectImpure?: boolean;
}

/**
 * A package whose published entry points carry a browser-purity claim.
 *
 * The ROW SET IS NEVER AUTHORED. It is read from the package's own `exports` map, so a sub-path
 * added to a manifest is probed the moment it is published - the previous hand-written list covered
 * 2 of the 13 sub-paths `@venizia/ignis-connectors` publishes, and the two that the example app
 * imports were among the eleven nobody was checking.
 */
export interface IPurityClaim {
  /** Directory under `packages/`, and the token `bun scripts/purity/cli.ts <token>` filters on. */
  package: string;
  /**
   * Sub-paths (as spelled in `exports`) when the claim covers only PART of the published surface.
   * Omit it and the whole surface is claimed.
   *
   * Only `helpers` needs this, and not as an exemption from a failure: that package is the server
   * toolbox - its root barrel reaches ioredis, winston and minio by design, and `./core` +
   * `./common` exist precisely because it does. Every sub-path named here must still exist in
   * `exports`; a rename fails the derivation loudly rather than quietly dropping a row.
   */
  subpaths?: string[];
  /** `external` for one sub-path - see {@link IPurityEntry.external}. Keyed as spelled in `exports`. */
  external?: Record<string, string[]>;
  /**
   * Entries that CANNOT be browser-pure, keyed as spelled in `exports`, valued by the conditions
   * that are impure - a driver whose only job is to open a TCP socket to a database is not a purity
   * bug, and one condition can differ from another (`./sqlite/libsql` is pure to `import` and not to
   * `require`).
   *
   * The waiver is exact in BOTH directions: a listed entry that turns out to be pure fails as loudly
   * as an unlisted one that is not. A waiver nobody re-reads is how a real leak eventually hides.
   * Deriving still owns the ROW SET, so a sub-path added later is claimed pure by default and has to
   * earn its line here.
   */
  impure?: Record<string, string[]>;
}

/** Every package in this workspace publishes under this scope - a sufficient test for "ours". */
const WORKSPACE_SCOPE = '@venizia/';

/** `types` describes the entry, it is not a runtime target; `./package.json` is not code. */
const NON_RUNTIME_CONDITION = 'types';
const NON_CODE_SUBPATH = './package.json';

const PURITY_CLAIMS: IPurityClaim[] = [
  { package: 'inversion' },
  { package: 'filter' },
  {
    package: 'helpers',
    subpaths: ['./core', './common'],
  },
  { package: 'kernel' },
  { package: 'core-worker' },
  {
    package: 'connectors',
    // One reason, pinned exactly so a NEW impure entry still fails: the engine clients -
    // node-postgres, postgres-js, libsql, typesense - each speak a wire protocol to a server
    // process, so they reach for sockets, TLS or child processes and can never run in a browser
    // tab. They stay published because a Node consumer needs them.
    //
    // `./postgres/supabase` under `import` is measured, and needs Bun >= 1.4.1: under 1.4.0 the
    // `--target=browser` bundle listed the `drizzle-orm/supabase` re-exports (`anonRole`, ...) in
    // its export block without binding them, and this row fails with `drizzle-orm/supabase` as an
    // unresolved external import.
    impure: {
      './postgres/node-postgres': ['import', 'require'],
      './postgres/postgres-js': ['import', 'require'],
      './sqlite/libsql': ['require'],
      './typesense': ['import', 'require'],
    },
    external: {
      // PGlite ships ONE universal Emscripten build and relies on its package.json `browser` field
      // remapping fs/path/util/... to false. Vite honours that; `bun build` does not, so bundling it
      // here measures PGlite's packaging, not ours. Externalising it makes the gate answer the
      // question it exists to answer: is IGNIS's own driver code browser-pure?
      './postgres/pglite': ['@electric-sql/pglite'],
    },
  },
];

/**
 * A code-level guard, not just the JSDoc above: `external` is an escape hatch from this gate, and
 * a hatch with no lock is one bad edit away from hiding a real leak - `external: ['@venizia/ignis-helpers']`
 * on a red entry would silently turn it green by removing the exact root-barrel import this gate
 * exists to catch from the module graph, rather than proving it absent.
 *
 * Runs where `PURITY_MANIFEST` is constructed below, at module-evaluation time - not inside
 * `probeEntry`, which only some call paths reach with `external` set. Every consumer of this
 * manifest (`cli.ts` today, anything else that imports it later) triggers this check merely by
 * importing the module, before any row is read.
 *
 * Not `getError`/`ApplicationError`: this file runs standalone from the repository root via
 * `bun scripts/purity/cli.ts`, outside every workspace package, and `@venizia/ignis-helpers` does
 * not resolve from here (no root-level `node_modules` link, and installing one is out of bounds
 * for this gate). `scripts/check-catalog.ts`, the sibling script in this same directory, is the
 * established precedent for a plain `Error` in this specific, dependency-free tooling tier.
 */
export const assertNoWorkspaceExternal = (manifest: IPurityEntry[]): IPurityEntry[] => {
  for (const row of manifest) {
    for (const specifier of row.external ?? []) {
      if (!specifier.startsWith(WORKSPACE_SCOPE)) {
        continue;
      }

      throw new Error(
        `[purity][manifest] Entry '${row.label}' externalises '${specifier}', a workspace package ` +
          `| \`external\` may only exempt THIRD-PARTY packaging, never IGNIS's own code - doing so ` +
          `would hide the exact leak this gate exists to catch`,
      );
    }
  }

  return manifest;
};

type TExportsTarget = string | Record<string, string>;

const REPOSITORY_ROOT = join(__dirname, '../..');

const readExportsMap = (opts: { package: string }): Record<string, TExportsTarget> => {
  const manifestPath = join(REPOSITORY_ROOT, 'packages', opts.package, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    exports?: Record<string, TExportsTarget>;
  };

  if (!manifest.exports) {
    throw new Error(
      `[purity][manifest] '${opts.package}' claims browser purity but publishes no \`exports\` map ` +
        `| There is nothing to derive rows from - remove the claim or add the map`,
    );
  }

  return manifest.exports;
};

/**
 * `exports` may spell one sub-path as several conditions pointing at different builds - the dual
 * CJS/ESM packages do exactly that - and each is a separately resolvable file that a consumer can
 * end up importing, so each is probed. `default` normally repeats `require`, so files are deduped
 * and the FIRST condition naming a file is the one that labels it.
 */
const listConditionTargets = (
  target: TExportsTarget,
): Array<{ condition: string; file: string }> => {
  if (typeof target === 'string') {
    return [{ condition: 'default', file: target }];
  }

  const seen = new Set<string>();
  const targets: Array<{ condition: string; file: string }> = [];

  for (const [condition, file] of Object.entries(target)) {
    if (condition === NON_RUNTIME_CONDITION || seen.has(file)) {
      continue;
    }

    seen.add(file);
    targets.push({ condition, file });
  }

  return targets;
};

const buildLabel = (opts: {
  package: string;
  subpath: string;
  condition: string;
  isSoleTarget: boolean;
}): string => {
  const { package: packageName, subpath, condition, isSoleTarget } = opts;
  const suffix = subpath === '.' ? '' : subpath.slice(1);
  const base = `${packageName}${suffix}`;

  return isSoleTarget ? base : `${base} [${condition}]`;
};

/**
 * Exported for `manifest.test.ts`, which has to drive a claim that no longer matches its package's
 * `exports` map - the staleness guard is the whole point of deriving, and it cannot be asserted
 * through `PURITY_MANIFEST`, which by construction is never stale. Same precedent as `probe.ts`
 * exporting `GLOBAL_PATTERNS` and `stripBundlerPathComments`.
 */
export const deriveEntries = (claim: IPurityClaim): IPurityEntry[] => {
  const exportsMap = readExportsMap({ package: claim.package });
  const published = Object.keys(exportsMap).filter(subpath => subpath !== NON_CODE_SUBPATH);

  for (const subpath of claim.subpaths ?? []) {
    if (published.includes(subpath)) {
      continue;
    }

    throw new Error(
      `[purity][manifest] '${claim.package}' claims '${subpath}', which its \`exports\` map no longer ` +
        `publishes | Published: ${published.join(', ')} - a renamed sub-path must not silently drop its row`,
    );
  }

  for (const subpath of Object.keys(claim.external ?? {})) {
    if (published.includes(subpath)) {
      continue;
    }

    throw new Error(
      `[purity][manifest] '${claim.package}' declares \`external\` for '${subpath}', which its ` +
        `\`exports\` map no longer publishes | An external that outlives its entry is a waiver ` +
        `nobody is reading`,
    );
  }

  const claimed = claim.subpaths ?? published;

  for (const subpath of Object.keys(claim.impure ?? {})) {
    if (claimed.includes(subpath)) {
      continue;
    }

    throw new Error(
      `[purity][manifest] '${claim.package}' waives '${subpath}' as impure, but that sub-path is not ` +
        `claimed | Claimed: ${claimed.join(', ')} - a waiver against nothing is one nobody is reading`,
    );
  }

  const entries: IPurityEntry[] = [];

  for (const subpath of claimed) {
    const targets = listConditionTargets(exportsMap[subpath]!);

    for (const condition of claim.impure?.[subpath] ?? []) {
      if (targets.some(target => target.condition === condition)) {
        continue;
      }

      throw new Error(
        `[purity][manifest] '${claim.package}' waives '${subpath}' under condition '${condition}', ` +
          `which its \`exports\` map does not publish | Published: ${targets.map(t => t.condition).join(', ')}`,
      );
    }

    for (const { condition, file } of targets) {
      entries.push({
        label: buildLabel({
          package: claim.package,
          subpath,
          condition,
          isSoleTarget: targets.length === 1,
        }),
        package: claim.package,
        entry: join('packages', claim.package, file),
        ...(claim.external?.[subpath] ? { external: claim.external[subpath] } : {}),
        ...(claim.impure?.[subpath]?.includes(condition) ? { expectImpure: true } : {}),
      });
    }
  }

  return entries;
};

/**
 * A browser claim is only honest if a browser bundler can actually consume the entry. A CJS-only
 * package forces every consumer into a workaround - `examples/browser-bff` needed an
 * `optimizeDeps.include` line per sub-path plus a `define: { __filename }` shim, because Vite serves
 * a linked workspace dependency as-is and the browser then meets a bare `require()`.
 *
 * So the claim carries the obligation: every claimed sub-path must publish an `import` condition.
 * Checked here rather than trusted to a comment, for the same reason as
 * {@link assertNoWorkspaceExternal} - the failure is otherwise invisible until someone tries to
 * bundle the package downstream.
 */
export const assertBrowserImportCondition = (claims: IPurityClaim[]): IPurityClaim[] => {
  for (const claim of claims) {
    const exportsMap = readExportsMap({ package: claim.package });
    const claimed = claim.subpaths ?? Object.keys(exportsMap).filter(s => s !== NON_CODE_SUBPATH);

    for (const subpath of claimed) {
      const target = exportsMap[subpath];

      if (typeof target === 'object' && target !== null && 'import' in target) {
        continue;
      }

      throw new Error(
        `[purity][manifest] '${claim.package}' claims browser purity for '${subpath}' but publishes no ` +
          `\`import\` condition | A browser bundler would fall back to the CommonJS entry, so the claim ` +
          `cannot be consumed - add an ESM build (see any dual-built package's tsconfig.esm.json)`,
      );
    }
  }

  return claims;
};

export const PURITY_MANIFEST: IPurityEntry[] = assertNoWorkspaceExternal(
  assertBrowserImportCondition(PURITY_CLAIMS).flatMap(deriveEntries),
);
