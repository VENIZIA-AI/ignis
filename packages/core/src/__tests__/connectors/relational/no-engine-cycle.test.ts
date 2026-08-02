import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * Reads the built `dist`, not `src`: the edge guarded against exists only as an emitted `require`,
 * and it can sit five hops deep where grepping for an adapter name sees nothing. A stale or empty
 * `dist` would make the walk vacuous, so the emptiness guards below fail loudly - run `make core`
 * first. `dist` resolves from the cwd; `bun test` runs from `packages/core`.
 */
const DIST = resolve('dist');
const CONNECTORS_DIST = join(DIST, 'connectors');
const NEUTRAL_TIER = 'relational';

/**
 * Every sibling of the neutral tier is an adapter, DISCOVERED rather than listed, so a third
 * connector is covered the day its directory appears. Naming engines leaves the next one unguarded.
 */
const listAdapterDirectories = (): string[] =>
  readdirSync(CONNECTORS_DIST, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== NEUTRAL_TIER)
    .map(entry => join(CONNECTORS_DIST, entry.name));

const RELATIONAL_DIST = join(CONNECTORS_DIST, NEUTRAL_TIER);

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

const walkFromRelational = (): IWalkResult => {
  const roots = listJsFiles(RELATIONAL_DIST);
  const adapterDirectories = listAdapterDirectories();
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

      if (adapterDirectories.some(directory => next.startsWith(`${directory}/`))) {
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

describe('relational tier never reaches an engine adapter at runtime', () => {
  test('dist is built - a missing or empty dist would make this suite pass vacuously', () => {
    expect(statSync(RELATIONAL_DIST).isDirectory()).toBe(true);
    expect(listJsFiles(RELATIONAL_DIST).length).toBeGreaterThan(0);

    const adapterDirectories = listAdapterDirectories();

    // Both engines named explicitly ONLY here: a discovery that silently
    // found nothing would make the walk pass against an empty offender set.
    for (const engine of ['postgres', 'sqlite']) {
      const engineDist = join(CONNECTORS_DIST, engine);

      expect(adapterDirectories).toContain(engineDist);
      expect(listJsFiles(engineDist).length).toBeGreaterThan(0);
    }
  });

  test('breadth-first walk of the emitted require graph reaches zero adapter files', () => {
    const { rootCount, reachedCount, offenderChains } = walkFromRelational();

    expect(rootCount).toBeGreaterThan(0);
    expect(reachedCount).toBeGreaterThanOrEqual(rootCount);

    // Asserted as a string rather than an array so a failure prints the whole offending chain.
    const report =
      offenderChains.length === 0
        ? ''
        : [
            `dist/connectors/relational reaches an engine adapter via ${offenderChains.length} path(s) -`,
            'the relational tier must stay engine-neutral, no engine may depend on another:',
            ...offenderChains,
          ].join('\n');

    expect(report).toBe('');
  });
});
