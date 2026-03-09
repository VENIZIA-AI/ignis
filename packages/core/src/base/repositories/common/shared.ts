import { TTableSchemaWithId } from '@/base/models';
import { getTableColumns } from 'drizzle-orm';
/** Cached table columns type. */
export type TTableColumns = ReturnType<typeof getTableColumns>;

/** @internal WeakMap cache for table columns. */
const columnCache = new WeakMap<TTableSchemaWithId, TTableColumns>();

/** Gets table columns with caching to avoid repeated getTableColumns calls. */
export function getCachedColumns<Schema extends TTableSchemaWithId>(schema: Schema): TTableColumns {
  let columns = columnCache.get(schema);
  if (!columns) {
    columns = getTableColumns(schema);
    columnCache.set(schema, columns);
  }
  return columns;
}
