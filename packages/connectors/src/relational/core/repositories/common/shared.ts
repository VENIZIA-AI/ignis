import type { TTableSchemaWithId } from '@/relational/core/models/common';
import { getTableColumns } from 'drizzle-orm';
import type { TTableColumns } from './types';

/** Keyed by the schema object itself, so a schema that goes out of scope is collectable with its columns. */
export class TableColumnCache {
  private static readonly columns = new WeakMap<TTableSchemaWithId, TTableColumns>();

  /**
   * Null-prototype, so a column lookup cannot answer with something off `Object.prototype`.
   *
   * `getTableColumns()` returns an ordinary object, and every caller resolves a column by
   * truthiness - `const column = columns[key]; if (!column) { throw NOT FOUND }`. A caller-supplied
   * filter key of `toString` therefore found a function, passed the guard, and compiled to a
   * vacuous `$1 = $2` predicate; `constructor.a` reached the JSON path validator and threw a raw
   * TypeError. Fixing the object here closes all five call sites at once, in one line, instead of
   * five `Object.hasOwn` guards that a sixth call site would forget.
   */
  static get<Schema extends TTableSchemaWithId>(schema: Schema): TTableColumns {
    let columns = TableColumnCache.columns.get(schema);
    if (!columns) {
      columns = Object.assign(Object.create(null), getTableColumns(schema)) as TTableColumns;
      TableColumnCache.columns.set(schema, columns);
    }

    return columns;
  }
}

/** Published name of {@link TableColumnCache.get}. */
export const getCachedColumns = <Schema extends TTableSchemaWithId>(
  schema: Schema,
): TTableColumns => TableColumnCache.get(schema);
