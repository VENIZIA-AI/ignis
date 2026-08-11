import { getError } from '@venizia/ignis-helpers';

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

/**
 * The raw `json_extract` expression the neutral walk feeds to `sql.raw`. Safe as text only because
 * the caller has already resolved the column against the schema and passed every component through
 * `validateJsonPathComponents`, whose pattern admits no quote.
 *
 * Coalescing loses nothing: a container is either an array or an object, so at most one candidate
 * resolves to non-NULL.
 */
export const toSqliteJsonExtraction = (opts: { columnName: string; path: string[] }): string => {
  const { columnName, path } = opts;

  const extractions = toSqliteJsonPaths({ path }).map(
    literal => `json_extract("${columnName}", '${literal}')`,
  );

  return extractions.length > 1 ? `coalesce(${extractions.join(', ')})` : extractions.join('');
};
