/**
 * The body of a Postgres text-array path literal, every element double-quoted. An unquoted `NULL`
 * element is SQL NULL, so a segment named `null` would never reach its key. Segments have already
 * passed `JSON_PATH_PATTERN`, which admits no quote or backslash. An empty path stays empty.
 */
export const toPostgresJsonPathElements = (opts: { path: string[] }): string => {
  const { path } = opts;
  return path.length === 0 ? '' : `"${path.join('","')}"`;
};
