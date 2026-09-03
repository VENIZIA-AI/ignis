import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

/**
 * Reads the built `dist`, not `src`: the edge guarded against exists only as an emitted `require`,
 * and it can sit five hops deep where grepping for an adapter name sees nothing. A stale or empty
 * `dist` would make the walk vacuous, so the emptiness guards below fail loudly - run `make connectors`
 * first. `dist` resolves from the cwd; `bun test` runs from `packages/connectors`.
 */
/** `dist/cjs`, not `dist`: this package dual-builds, and the two halves emit the same tree - walking one is enough. */
const DIST = resolve('dist', 'cjs');

/** Every paradigm family names its engine-neutral tier this. */
const NEUTRAL_TIER = 'core';

/**
 * Both families, DISCOVERED rather than listed: `relational` and `search` today, and whatever the
 * next paradigm is called the day its directory appears. Before the tier split this walk started at
 * `dist/connectors/relational` and every sibling was an adapter, so it covered postgres, sqlite,
 * search, typesense and meilisearch in one pass; walking one family only would silently drop three
 * of the five.
 */
const listFamilyDirectories = (): string[] =>
  readdirSync(DIST, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(DIST, entry.name))
    .filter(directory => {
      try {
        return statSync(join(directory, NEUTRAL_TIER)).isDirectory();
      } catch {
        // A directory with no neutral tier is not a paradigm family - nothing to walk from.
        return false;
      }
    });

/**
 * Everything a family's neutral tier must not reach: every engine adapter in ANY family, plus every
 * OTHER family's neutral tier. One paradigm depending on another is the same defect as one engine
 * depending on another - `relational` reaching `search` is precisely what the pre-split walk forbade.
 */
const listForbiddenDirectories = (opts: { walkingFrom: string }): string[] => {
  const forbidden: string[] = [];

  for (const family of listFamilyDirectories()) {
    for (const entry of readdirSync(family, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const directory = join(family, entry.name);
      if (directory === opts.walkingFrom) {
        continue;
      }

      forbidden.push(directory);
    }
  }

  return forbidden;
};

const listJsFiles = (dir: string): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listJsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
};

/** Resolves a relative module specifier the way Node does: exact file, `.js`, then `index.js`. */
const resolveSpecifier = (opts: { fromFile: string; specifier: string }): string | null => {
  const { fromFile, specifier } = opts;

  if (!specifier.startsWith('.')) {
    return null;
  }

  const base = resolve(dirname(fromFile), specifier);

  for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Candidate does not exist - try the next resolution form.
    }
  }

  return null;
};

/**
 * `require()` covers the CJS emit; the `from '...'` form
 * keeps the walk honest if the emit ever turns ESM.
 */
const REQUIRE_PATTERN = /require\(\s*["']([^"']+)["']\s*\)/g;
const FROM_PATTERN = /(?:^|[\s;}])(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/gm;

const outgoingEdges = (file: string): string[] => {
  const source = readFileSync(file, 'utf8');
  const targets = new Set<string>();

  for (const pattern of [REQUIRE_PATTERN, FROM_PATTERN]) {
    for (const match of source.matchAll(pattern)) {
      const resolved = resolveSpecifier({ fromFile: file, specifier: match[1] ?? '' });

      if (resolved) {
        targets.add(resolved);
      }
    }
  }

  return [...targets];
};

interface IWalkResult {
  rootCount: number;
  reachedCount: number;
  offenderChains: string[];
}

const walkFromNeutralTier = (opts: { family: string }): IWalkResult => {
  const neutralTier = join(opts.family, NEUTRAL_TIER);
  const roots = listJsFiles(neutralTier);
  const forbiddenDirectories = listForbiddenDirectories({ walkingFrom: neutralTier });
  const cameFrom = new Map<string, string | null>();
  const queue: string[] = [];

  for (const root of roots) {
    cameFrom.set(root, null);
    queue.push(root);
  }

  const offenders: string[] = [];
  let head = 0;

  while (head < queue.length) {
    const file = queue[head];
    head += 1;

    if (!file) {
      continue;
    }

    for (const next of outgoingEdges(file)) {
      if (cameFrom.has(next)) {
        continue;
      }

      cameFrom.set(next, file);
      queue.push(next);

      if (forbiddenDirectories.some(directory => next.startsWith(`${directory}/`))) {
        offenders.push(next);
      }
    }
  }

  const chainTo = (leaf: string): string => {
    const hops: string[] = [];
    let current: string | null = leaf;

    while (current) {
      hops.unshift(relative(DIST, current));
      current = cameFrom.get(current) ?? null;
    }

    return hops.join('\n    -> ');
  };

  return {
    rootCount: roots.length,
    reachedCount: cameFrom.size,
    offenderChains: offenders.map(chainTo),
  };
};

describe('no neutral tier reaches an engine adapter at runtime', () => {
  test('dist is built and every family is discovered - a missing dist would pass vacuously', () => {
    const families = listFamilyDirectories().map(directory => basename(directory));

    // Families and engines named explicitly ONLY here: a discovery that silently found nothing
    // would make every walk below pass against an empty offender set. This is also the assertion
    // that fails the day a tier stops being guarded - the search tier fell out once already.
    expect(families.sort()).toEqual(['relational', 'search']);

    for (const [family, engines] of Object.entries({
      relational: ['core', 'postgres', 'sqlite'],
      search: ['core', 'meilisearch', 'typesense'],
    })) {
      for (const engine of engines) {
        const engineDist = join(DIST, family, engine);

        expect(statSync(engineDist).isDirectory()).toBe(true);
        expect(listJsFiles(engineDist).length).toBeGreaterThan(0);
      }
    }
  });

  test.each(listFamilyDirectories())(
    'breadth-first walk of %s/core reaches zero adapter files',
    (family: string) => {
      const { rootCount, reachedCount, offenderChains } = walkFromNeutralTier({ family });

      expect(rootCount).toBeGreaterThan(0);
      expect(reachedCount).toBeGreaterThanOrEqual(rootCount);

      // Asserted as a string rather than an array so a failure prints the whole offending chain.
      const report =
        offenderChains.length === 0
          ? ''
          : [
              `${relative(DIST, family)}/core reaches a forbidden tier via ${offenderChains.length} path(s) -`,
              'a neutral tier must stay engine-neutral, and no paradigm may depend on another:',
              ...offenderChains,
            ].join('\n');

      expect(report).toBe('');
    },
  );
});
