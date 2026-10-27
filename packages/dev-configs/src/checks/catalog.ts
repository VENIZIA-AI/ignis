import { Glob } from 'bun';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards dependency versions against the root `workspaces.catalog`.
 *
 * A catalogued dep is referenced as `catalog:` and resolved at publish time by `bun publish`, which
 * substitutes the real range while packing. `npm publish` does NOT - it ships `catalog:` verbatim
 * and the manifest is unresolvable for every consumer, which is how 0.1.1-9 / -6 / -4 broke.
 */
export interface ICatalogProblem {
  file: string;
  message: string;
}

export interface ICatalogOptions {
  /** The repository root: where the root `package.json` and the globs resolve. Default: the current folder. */
  root?: string;

  /** Manifests to check, beside `packages/*\/package.json`. A glob relative to the root. */
  globs?: string[];

  /**
   * Files that are not published manifests but carry `dependencies` and `devDependencies` the
   * release resolves (a VULCAN preset): `catalog:` is allowed in their `peerDependencies`, because a
   * library preset gives one name one catalog range. A file belongs here when its path starts with
   * this prefix, for example `presets/`.
   */
  presetPrefix?: string;

  /**
   * Manifests outside the workspace (a wiki with its own lockfile): `catalog:` does not resolve
   * there, so a catalogued dependency must be pinned to exactly the catalog's version instead.
   */
  pinned?: string[];
}

export interface ICatalogReport {
  problems: ICatalogProblem[];
  entries: number;
  referenced: number;

  /** Set when there is no `workspaces.catalog` to check against. */
  noCatalog: boolean;
}

/** `peerDependencies` are compatibility statements for consumers and stay deliberately looser than the install range. */
const CATALOGUED_BLOCKS = ['dependencies', 'devDependencies'] as const;

const DEFAULT_GLOB = 'packages/*/package.json';

interface IManifest {
  workspaces?: { catalog?: Record<string, string> };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** Reads the root catalog and every manifest the options name, and reports everything wrong with their ranges. */
export const findCatalogProblems = async (opts: ICatalogOptions = {}): Promise<ICatalogReport> => {
  const { root = process.cwd(), globs = [], presetPrefix, pinned = [] } = opts;
  const rootJson: IManifest = JSON.parse(await Bun.file(join(root, 'package.json')).text());
  const catalog: Record<string, string> = rootJson.workspaces?.catalog ?? {};

  if (Object.keys(catalog).length === 0) {
    return { problems: [], entries: 0, referenced: 0, noCatalog: true };
  }

  const problems: ICatalogProblem[] = [];
  const referenced = new Set<string>();
  const presentPinned = pinned.filter((file) => existsSync(join(root, file)));

  const files = new Set<string>();
  for (const pattern of [DEFAULT_GLOB, ...globs]) {
    for await (const file of new Glob(pattern).scan(root)) {
      files.add(file);
    }
  }

  for (const file of [...files, ...presentPinned]) {
    let json: IManifest;

    try {
      json = JSON.parse(await Bun.file(join(root, file)).text());
    } catch (error) {
      problems.push({
        file,
        message: `invalid JSON - ${error instanceof Error ? error.message : error}`,
      });
      continue;
    }

    const isPinned = presentPinned.includes(file);

    for (const block of CATALOGUED_BLOCKS) {
      const entriesList = Object.entries(json[block] ?? {});
      for (const [dep, range] of entriesList) {
        if (!(dep in catalog)) {
          continue;
        }

        referenced.add(dep);

        if (isPinned) {
          if (range !== catalog[dep]) {
            problems.push({
              file,
              message: `${block}.${dep} is "${range}" but the catalog pins "${catalog[dep]}" - this project is outside the workspace, so pin exactly that`,
            });
          }

          continue;
        }

        if (range === 'catalog:') {
          continue;
        }

        problems.push({
          file,
          message: `${block}.${dep} is "${range}" but the catalog owns it - use "catalog:" (catalog pins ${catalog[dep]})`,
        });
      }
    }

    // A preset is not a published manifest: its markers are resolved by the release, and the library kind gives a
    // name one catalog range, so a lib's peer takes the same marker as its dev dependency.
    const isPreset = presetPrefix !== undefined && file.startsWith(presetPrefix);

    // A peer resolved from the catalog would collapse to the exact install range, losing the looseness that makes it a peer.
    const peerEntries = Object.entries(json.peerDependencies ?? {});
    for (const [dep, range] of peerEntries) {
      if (range !== 'catalog:' || isPreset) {
        continue;
      }

      problems.push({
        file,
        message: `peerDependencies.${dep} uses "catalog:" - a peer range must stay hand-authored and looser than the install range`,
      });
    }
  }

  // A catalog entry nobody references is dead weight that will drift out of date unnoticed.
  const catalogKeys = Object.keys(catalog);
  for (const dep of catalogKeys) {
    if (referenced.has(dep)) {
      continue;
    }

    problems.push({
      file: 'package.json',
      message: `catalog entry "${dep}" is referenced by no workspace - drop it`,
    });
  }

  return { problems, entries: catalogKeys.length, referenced: referenced.size, noCatalog: false };
};
