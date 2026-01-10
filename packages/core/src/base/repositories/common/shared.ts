import { TTableSchemaWithId } from '@/base/models';
import { getTableColumns } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Column Cache Utility
// -----------------------------------------------------------------------------

/** Cached table columns type. */
export type TTableColumns = ReturnType<typeof getTableColumns>;

/**
 * Shared cache for table columns across repository operators.
 * Uses WeakMap to allow garbage collection when schema is no longer referenced.
 *
 * @internal
 */
const columnCache = new WeakMap<TTableSchemaWithId, TTableColumns>();

/**
 * Gets table columns with caching for performance.
 * Avoids repeated calls to `getTableColumns` for the same schema.
 *
 * @param schema - The Drizzle table schema
 * @returns The table columns object
 *
 * @example
 * ```typescript
 * const columns = getCachedColumns(UserSchema);
 * // columns: { id: Column, name: Column, email: Column, ... }
 * ```
 */
export function getCachedColumns<Schema extends TTableSchemaWithId>(schema: Schema): TTableColumns {
  let columns = columnCache.get(schema);
  if (!columns) {
    columns = getTableColumns(schema);
    columnCache.set(schema, columns);
  }
  return columns;
}
