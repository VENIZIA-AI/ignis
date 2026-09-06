import type { TAtlasMode } from '@/common';
import { symbolsFileOf } from '@/common/layout';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import { existsSync, readFileSync } from 'node:fs';
import type { ISymbolRecord, ISymbolTable } from './common';

const DEFAULT_SUGGESTION_LIMIT = 5;
const MAX_SUGGESTION_DISTANCE = 2;

/**
 * Every spelling of one package as its directory name: `@venizia/ignis-helpers`, `ignis-helpers`
 * and `helpers` are one, `@venizia/ignis` is `core-server` and `@venizia/ignis-worker` is
 * `core-worker` - the same names `version` and `changes` answer with.
 */
const normalizePackage = (value: string): string => {
  const bare = value
    .trim()
    .toLowerCase()
    .replace(/^@[^/]+\//, '');

  if (bare === 'ignis') {
    return 'core-server';
  }

  const suffix = bare.replace(/^ignis-/, '');
  return suffix === 'worker' ? 'core-worker' : suffix;
};

/**
 * Levenshtein distance over two rows, abandoned once every cell of a row exceeds `max` - a typo
 * is compared against every known name, so the common case must stop early, not finish.
 */
const distanceWithin = (opts: { left: string; right: string; max: number }): number => {
  const { left, right, max } = opts;
  if (Math.abs(left.length - right.length) > max) {
    return max + 1;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let best = row;

    for (let column = 1; column <= right.length; column += 1) {
      const substitution = previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1);
      const cell = Math.min(substitution, previous[column] + 1, current[column - 1] + 1);
      current.push(cell);
      best = Math.min(best, cell);
    }

    if (best > max) {
      return max + 1;
    }
    previous = current;
  }

  return previous[right.length];
};

/** Keeps the first occurrence of every value, in order - the buckets below overlap by design. */
const dedupe = (values: string[]): string[] => [...new Set(values)];

const byName = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

/**
 * The generated symbol table in memory: exact lookup by name, and a suggestion list for a name
 * that is not in it. One instance per server - the table never changes while the process runs.
 */
export class SymbolStore extends BaseHelper {
  private readonly byExactName = new Map<string, ISymbolRecord[]>();
  private readonly namesByLowerCase = new Map<string, string[]>();

  constructor(opts: { symbols: ISymbolRecord[] }) {
    super({ scope: SymbolStore.name });

    for (const symbol of opts.symbols) {
      const exact = this.byExactName.get(symbol.name) ?? [];
      exact.push(symbol);
      this.byExactName.set(symbol.name, exact);

      const lower = symbol.name.toLowerCase();
      const names = this.namesByLowerCase.get(lower) ?? [];
      if (!names.includes(symbol.name)) {
        names.push(symbol.name);
        this.namesByLowerCase.set(lower, names);
      }
    }
  }

  /**
   * Repo mode reads the knowledge bundle's table, snapshot mode the packaged one. A missing or
   * unreadable table leaves the store empty - the `symbol` tool says so, the server still starts.
   */
  static load(opts: { mode: TAtlasMode; root: string }): SymbolStore {
    const path = symbolsFileOf(opts);
    if (!existsSync(path)) {
      return new SymbolStore({ symbols: [] });
    }

    try {
      const table: ISymbolTable = JSON.parse(readFileSync(path, 'utf8'));
      return new SymbolStore({ symbols: table.symbols ?? [] });
    } catch (error) {
      const store = new SymbolStore({ symbols: [] });
      store.logger.for('load').error('unreadable symbol table | path: %s | error: %s', path, error);
      return store;
    }
  }

  /** Whether no table was loaded at all - distinct from a table that simply does not carry a name. */
  isEmpty(): boolean {
    return this.byExactName.size === 0;
  }

  /** Every exact-name match, narrowed by `package` when given; a name can exist in more than one package. */
  lookup(opts: { name: string; package?: string }): ISymbolRecord[] {
    const found = this.byExactName.get(opts.name) ?? [];
    if (opts.package === undefined) {
      return found;
    }

    const wanted = normalizePackage(opts.package);
    return found.filter(record => normalizePackage(record.package) === wanted);
  }

  /** The closest known names to `name`: prefix matches first, then substrings, then near-misses. */
  suggest(opts: { name: string; limit?: number }): string[] {
    const limit = opts.limit ?? DEFAULT_SUGGESTION_LIMIT;
    const wanted = opts.name.toLowerCase();
    const lowerNames = [...this.namesByLowerCase.keys()];

    const prefixed = lowerNames.filter(name => name.startsWith(wanted)).sort(byName);
    const contained = lowerNames.filter(name => name.includes(wanted)).sort(byName);
    const near = lowerNames
      .map(name => ({
        name,
        distance: distanceWithin({ left: wanted, right: name, max: MAX_SUGGESTION_DISTANCE }),
      }))
      .filter(entry => entry.distance <= MAX_SUGGESTION_DISTANCE)
      .sort((left, right) => left.distance - right.distance || byName(left.name, right.name))
      .map(entry => entry.name);

    const ordered = dedupe([...prefixed, ...contained, ...near]).flatMap(
      lower => this.namesByLowerCase.get(lower) ?? [],
    );

    return ordered.slice(0, limit);
  }
}
