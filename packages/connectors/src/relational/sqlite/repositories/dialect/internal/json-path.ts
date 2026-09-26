import type { TTableColumns } from '@/relational/core/repositories/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { SQLChunk } from 'drizzle-orm';
import { StringChunk } from 'drizzle-orm';

/** Every all-digit component doubles the candidate paths, and filter keys arrive from callers. */
const MAX_AMBIGUOUS_COMPONENTS = 4;

const isAmbiguousComponent = (opts: { part: string }): boolean => /^\d+$/.test(opts.part);

/**
 * Every path literal a component sequence can mean, array reading first. SQLite cannot
 * express both readings of an all-digit component at once - `$."c"[0]` is an array element,
 * `$."c"."0"` an object key, and neither falls back to the other - while Postgres's `#>>
 * '{c,0}'` addresses both. Handing SQLite every candidate is what makes the engines agree.
 */
export const toSqliteJsonPaths = (opts: { path: string[] }): string[] => {
  const { path } = opts;

  const ambiguousCount = path.filter(part => isAmbiguousComponent({ part })).length;
  if (ambiguousCount > MAX_AMBIGUOUS_COMPONENTS) {
    throw getError({
      message: `[toSqliteJsonPaths] Ambiguous JSON path components over the limit | max: ${MAX_AMBIGUOUS_COMPONENTS} | got: ${ambiguousCount} | each all-digit component doubles the candidate paths`,
    });
  }

  let literals = ['$'];

  for (const part of path) {
    literals = isAmbiguousComponent({ part })
      ? literals.flatMap(literal => [`${literal}[${part}]`, `${literal}."${part}"`])
      : literals.map(literal => `${literal}."${part}"`);
  }

  return literals;
};

const EXTRACTION_OPEN = new StringChunk('json_extract(');
const COALESCED_EXTRACTION_OPEN = new StringChunk('coalesce(json_extract(');

/**
 * The `json_extract` expression for one JSON-path key, as the chunks of one flat fragment (every
 * nested `SQL` level costs a render pass); a caller may append a chunk before `sql.fromList`. The
 * Drizzle column chunk is qualified or aliased like a plain key. The path literal is raw text, safe
 * only because every component has passed `validateJsonPathComponents`, which admits no quote.
 *
 * Coalescing loses nothing: a container is either an array or an object, so at most one candidate
 * resolves to non-NULL.
 */
export const toSqliteJsonExtractionChunks = (opts: {
  column: TTableColumns[string];
  path: string[];
}): SQLChunk[] => {
  const { column, path } = opts;

  const literals = toSqliteJsonPaths({ path });
  const lastIndex = literals.length - 1;
  // json_extract(col, 'L') | coalesce(json_extract(col, 'L0'), ..., json_extract(col, 'Ln'))
  const chunks: SQLChunk[] = [lastIndex === 0 ? EXTRACTION_OPEN : COALESCED_EXTRACTION_OPEN];

  for (let index = 0; index < lastIndex; index++) {
    chunks.push(column, new StringChunk(`, '${literals[index]}'), json_extract(`));
  }

  const closing = lastIndex === 0 ? ')' : '))';
  chunks.push(column, new StringChunk(`, '${literals[lastIndex]}'${closing}`));

  return chunks;
};
