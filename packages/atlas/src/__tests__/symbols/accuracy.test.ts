import type { ISymbolRecord, ISymbolTable } from '@/symbols';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

// __dirname, not import.meta: this package emits CommonJS.
const REPOSITORY_ROOT = join(__dirname, '../../../../..');
const TABLE = join(REPOSITORY_ROOT, '.agents/knowledge/reference/symbols.json');
const SAMPLE_SIZE = 50;

/**
 * Back-compat aliases: `export { BaseRelationalEntity as BaseEntity }` and friends have no
 * declaration of their own, so `file:line` points at what they alias and the line names the
 * aliased symbol. Listed, never skipped - the sample measures every other symbol.
 */
const KNOWN_ALIASES = new Set<string>([
  'BaseDataSource',
  'BaseEntity',
  'BasePostgresEntity',
  'IApplicationConfigs',
  'TypesenseBaseRepository',
]);

/**
 * The aliases whose declaration file never spells the alias out at all - pinned exactly, so a new
 * one fails here instead of hiding. `IApplicationConfigs` is absent: its file imports that name
 * from kernel on another line.
 */
const ALIASES_MISSING_FROM_THEIR_FILE = new Set<string>([
  'BaseDataSource',
  'BaseEntity',
  'BasePostgresEntity',
  'TypesenseBaseRepository',
]);

/** Whether the file `entry` names exists and mentions the symbol at all - the line-level check is the sample's job. */
const fileMentionsItsName = (opts: { entry: ISymbolRecord }): boolean => {
  const absolute = join(REPOSITORY_ROOT, opts.entry.file);
  return existsSync(absolute) && readFileSync(absolute, 'utf8').includes(opts.entry.name);
};

/** Round-robin across packages, evenly spaced inside each, so one large package cannot fill the sample. */
const sampleOf = (opts: { symbols: ISymbolRecord[]; size: number }): ISymbolRecord[] => {
  const byPackage = new Map<string, ISymbolRecord[]>();
  for (const symbol of opts.symbols) {
    const bucket = byPackage.get(symbol.package) ?? [];
    bucket.push(symbol);
    byPackage.set(symbol.package, bucket);
  }

  const buckets = [...byPackage.values()];
  const perPackage = Math.ceil(opts.size / Math.max(buckets.length, 1));
  const picked: ISymbolRecord[] = [];

  for (let round = 0; round < perPackage; round += 1) {
    for (const bucket of buckets) {
      const stride = Math.max(Math.floor(bucket.length / perPackage), 1);
      const entry = bucket[round * stride];
      if (entry && picked.length < opts.size) {
        picked.push(entry);
      }
    }
  }

  return picked;
};

const hasTable = existsSync(TABLE);

describe.skipIf(!hasTable)('symbol accuracy on a 50-symbol sample', () => {
  const table: ISymbolTable = JSON.parse(hasTable ? readFileSync(TABLE, 'utf8') : '{}');
  const symbols = table.symbols ?? [];
  // The aliases are pinned by the whole-table test below; the sample measures the rest.
  const sample = sampleOf({
    symbols: symbols.filter(entry => !KNOWN_ALIASES.has(entry.name)),
    size: SAMPLE_SIZE,
  });

  test('the sample covers every package the table names, at the full sample size', () => {
    expect(sample).toHaveLength(SAMPLE_SIZE);
    expect(new Set(sample.map(entry => entry.package)).size).toBe(
      new Set(symbols.map(entry => entry.package)).size,
    );
  });

  test('every symbol lands in a file that names it, except the aliases listed here', () => {
    const unresolved = symbols.filter(entry => !fileMentionsItsName({ entry }));

    expect([...new Set(unresolved.map(entry => entry.name))].sort()).toEqual(
      [...ALIASES_MISSING_FROM_THEIR_FILE].sort(),
    );
  });

  const rows: Array<[string, ISymbolRecord]> = sample.map(entry => [
    `${entry.specifier} ${entry.name}`,
    entry,
  ]);

  test.each(rows)('%s resolves to a source line that carries the name', (_label, entry) => {
    const absolute = join(REPOSITORY_ROOT, entry.file);
    expect(existsSync(absolute), `${entry.file} does not exist`).toBe(true);

    const lines = readFileSync(absolute, 'utf8').split('\n');
    expect(entry.line).toBeGreaterThan(0);
    expect(entry.line, `${entry.file}:${entry.line} is past the end`).toBeLessThanOrEqual(
      lines.length,
    );
    expect(lines[entry.line - 1], `${entry.file}:${entry.line} misses ${entry.name}`).toContain(
      entry.name,
    );
  });
});
