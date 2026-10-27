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
   * Never for the repository's own source: an external hides that file from the module graph
   * entirely, so using it on our own code would let a real leak through unseen rather than prove
   * anything pure. Enforced by {@link assertNoWorkspaceExternal}, not left to this comment alone.
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
 * added to a manifest is probed the moment it is published.
 */
export interface IPurityClaim {
  /** Directory under `packages/`, and the token `devz check purity <token>` filters on. */
  package: string;
  /**
   * Sub-paths (as spelled in `exports`) when the claim covers only PART of the published surface.
   * Omit it and the whole surface is claimed. Every sub-path named here must still exist in
   * `exports`; a rename fails the derivation loudly rather than quietly dropping a row.
   */
  subpaths?: string[];
  /** `external` for one sub-path - see {@link IPurityEntry.external}. Keyed as spelled in `exports`. */
  external?: Record<string, string[]>;
  /**
   * Entries that CANNOT be browser-pure, keyed as spelled in `exports`, valued by the conditions
   * that are impure. The waiver is exact in BOTH directions: a listed entry that turns out to be
   * pure fails as loudly as an unlisted one that is not. Deriving still owns the ROW SET, so a
   * sub-path added later is claimed pure by default and has to earn its line here.
   */
  impure?: Record<string, string[]>;
}

/** What a repository may tune about the engine; everything else is the engine's contract. */
export interface IPurityOptions {
  /**
   * When set, every claimed sub-path must publish its runtime entries below this prefix (for
   * example `./dist/esm/`): a browser bundler needs an ES module, so a CommonJS-only entry makes
   * the claim unconsumable. Omit it for a repository that publishes a single build.
   */
  esmEntryPrefix?: string;

  /** Package-name prefix of this repository's own packages; an `external` may never start with it. Default `@venizia/`. */
  workspaceScope?: string;
}

const DEFAULT_WORKSPACE_SCOPE = '@venizia/';

/** The one place this engine builds an `Error`: `getError` would make dev-configs depend on inversion, which depends on dev-configs. */
// eslint-disable-next-line venizia/no-new-error -- getError would be a dev-configs -> inversion cycle
const purityError = (message: string): Error => new Error(message);

/** `types` describes the entry, it is not a runtime target; `./package.json` is not code. */
const NON_RUNTIME_CONDITION = 'types';
const NON_CODE_SUBPATH = './package.json';

/**
 * A code-level guard, not just the JSDoc on `external`: it is an escape hatch from this gate, and a
 * hatch with no lock is one bad edit away from hiding a real leak - `external: ['@venizia/ignis-helpers']`
 * on a red entry would silently turn it green by removing the exact root-barrel import this gate
 * exists to catch from the module graph, rather than proving it absent.
 *
 * A plain `Error`, not `getError`: the engine runs from the repository root through `devz`, outside
 * every workspace package, and has no logger to resolve.
 */
export const assertNoWorkspaceExternal = (
  manifest: IPurityEntry[],
  workspaceScope: string = DEFAULT_WORKSPACE_SCOPE,
): IPurityEntry[] => {
  for (const row of manifest) {
    const specifiers = row.external ?? [];
    for (const specifier of specifiers) {
      if (!specifier.startsWith(workspaceScope)) {
        continue;
      }

      throw purityError(
        `[purity][manifest] Entry '${row.label}' externalises '${specifier}', a workspace package ` +
          `| \`external\` may only exempt THIRD-PARTY packaging, never the repository's own code - doing so ` +
          `would hide the exact leak this gate exists to catch`,
      );
    }
  }

  return manifest;
};

type TExportsTarget = string | Record<string, string>;

const readExportsMap = (opts: {
  root: string;
  package: string;
}): Record<string, TExportsTarget> => {
  const manifestPath = join(opts.root, 'packages', opts.package, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    exports?: Record<string, TExportsTarget>;
  };

  if (!manifest.exports) {
    throw purityError(
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

  const targetEntries = Object.entries(target);
  for (const [condition, file] of targetEntries) {
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
 * Exported for the tests, which have to drive a claim that no longer matches its package's
 * `exports` map - the staleness guard is the whole point of deriving, and it cannot be asserted
 * through a built manifest, which by construction is never stale.
 */
export const deriveEntries = (opts: { claim: IPurityClaim; root: string }): IPurityEntry[] => {
  const { claim, root } = opts;
  const exportsMap = readExportsMap({ root, package: claim.package });
  const published = Object.keys(exportsMap).filter((subpath) => subpath !== NON_CODE_SUBPATH);

  const subpathsList = claim.subpaths ?? [];
  for (const subpath of subpathsList) {
    if (published.includes(subpath)) {
      continue;
    }

    throw purityError(
      `[purity][manifest] '${claim.package}' claims '${subpath}', which its \`exports\` map no longer ` +
        `publishes | Published: ${published.join(', ')} - a renamed sub-path must not silently drop its row`,
    );
  }

  const claimExternalKeys = Object.keys(claim.external ?? {});
  for (const subpath of claimExternalKeys) {
    if (published.includes(subpath)) {
      continue;
    }

    throw purityError(
      `[purity][manifest] '${claim.package}' declares \`external\` for '${subpath}', which its ` +
        `\`exports\` map no longer publishes | An external that outlives its entry is a waiver ` +
        `nobody is reading`,
    );
  }

  const claimed = claim.subpaths ?? published;

  const claimImpureKeys = Object.keys(claim.impure ?? {});
  for (const subpath of claimImpureKeys) {
    if (claimed.includes(subpath)) {
      continue;
    }

    throw purityError(
      `[purity][manifest] '${claim.package}' waives '${subpath}' as impure, but that sub-path is not ` +
        `claimed | Claimed: ${claimed.join(', ')} - a waiver against nothing is one nobody is reading`,
    );
  }

  const entries: IPurityEntry[] = [];

  for (const subpath of claimed) {
    const targets = listConditionTargets(exportsMap[subpath]!);

    const conditions = claim.impure?.[subpath] ?? [];
    for (const condition of conditions) {
      if (targets.some((target) => target.condition === condition)) {
        continue;
      }

      throw purityError(
        `[purity][manifest] '${claim.package}' waives '${subpath}' under condition '${condition}', ` +
          `which its \`exports\` map does not publish | Published: ${targets.map((t) => t.condition).join(', ')}`,
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
 * A browser claim is only honest if a browser bundler can actually consume the entry. A CommonJS
 * entry forces every consumer into a workaround, so the claim carries the obligation: every claimed
 * sub-path must publish its runtime entries below `esmEntryPrefix`. Checked here rather than trusted
 * to a comment, for the same reason as {@link assertNoWorkspaceExternal} - the failure is otherwise
 * invisible until someone tries to bundle the package downstream.
 */
export const assertBrowserEsmEntry = (opts: {
  claims: IPurityClaim[];
  root: string;
  esmEntryPrefix: string;
}): IPurityClaim[] => {
  const { claims, root, esmEntryPrefix } = opts;

  for (const claim of claims) {
    const exportsMap = readExportsMap({ root, package: claim.package });
    const claimed = claim.subpaths ?? Object.keys(exportsMap).filter((s) => s !== NON_CODE_SUBPATH);

    for (const subpath of claimed) {
      const target = exportsMap[subpath];

      const runtimeTargets =
        typeof target === 'object' && target !== null
          ? Object.entries(target)
              .filter(([condition]) => condition !== NON_RUNTIME_CONDITION)
              .map(([, file]) => file)
          : [];

      if (
        runtimeTargets.length > 0 &&
        runtimeTargets.every((file) => file.startsWith(esmEntryPrefix))
      ) {
        continue;
      }

      throw purityError(
        `[purity][manifest] '${claim.package}' claims browser purity for '${subpath}' but its runtime ` +
          `entry is not in ${esmEntryPrefix.replace(/^\.\//, '')} | A browser bundler needs an ES module, so the claim ` +
          `cannot be consumed - build the package as ES modules`,
      );
    }
  }

  return claims;
};

/** The rows of a whole repository: every claim derived from its package's `exports`, then the guards. */
export const buildManifest = (opts: {
  claims: IPurityClaim[];
  root: string;
  options?: IPurityOptions;
}): IPurityEntry[] => {
  const { claims, root, options = {} } = opts;
  const { esmEntryPrefix, workspaceScope = DEFAULT_WORKSPACE_SCOPE } = options;

  const checked =
    esmEntryPrefix === undefined ? claims : assertBrowserEsmEntry({ claims, root, esmEntryPrefix });

  return assertNoWorkspaceExternal(
    checked.flatMap((claim) => deriveEntries({ claim, root })),
    workspaceScope,
  );
};
