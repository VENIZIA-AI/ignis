import type { TTableSchemaWithId } from '@/relational/core/models/common';
import { getTableColumns } from 'drizzle-orm';
import type { TTableColumns } from './types';

/** Keyed by the schema object itself, so a schema that goes out of scope is collectable with its columns. */
export class TableColumnCache {
  private static readonly columns = new WeakMap<TTableSchemaWithId, TTableColumns>();

  static get<Schema extends TTableSchemaWithId>(schema: Schema): TTableColumns {
    let columns = TableColumnCache.columns.get(schema);
    if (!columns) {
      columns = getTableColumns(schema);
      TableColumnCache.columns.set(schema, columns);
    }

    return columns;
  }
}

/** Published name of {@link TableColumnCache.get}. */
export const getCachedColumns = <Schema extends TTableSchemaWithId>(
  schema: Schema,
): TTableColumns => TableColumnCache.get(schema);
