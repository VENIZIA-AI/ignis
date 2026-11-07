/**
 * How a key of a `where`, or the field of an `order` entry, names a column. One reader for the query that builds the SQL and for
 * everything that must judge the same key (a request guard), so they cannot disagree about which column a key reaches.
 */
export class FilterKeys {
  /** A key with a `.` or a `[` is a JSON path into a column (`meta.tags[0]`), not a column name. */
  static isJsonPath(opts: { key: string }): boolean {
    return opts.key.includes('.') || opts.key.includes('[');
  }

  /** Splits a JSON path on dots and brackets, dropping the empty parts: `[meta].pin`, `.meta.pin` and `meta.pin` all read `meta`, then `pin`. */
  static parseJsonPath(opts: { key: string }): { columnName: string; path: string[] } {
    const parts = opts.key.split(/[.[\]]+/).filter(Boolean);
    const [columnName = opts.key, ...path] = parts;

    return { columnName, path };
  }

  /** The column a key reaches: the first part of a JSON path, or the key itself. */
  static columnOf(opts: { key: string }): string {
    return FilterKeys.isJsonPath(opts) ? FilterKeys.parseJsonPath(opts).columnName : opts.key;
  }
}
