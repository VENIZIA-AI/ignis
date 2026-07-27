import type { TTableSchemaWithId } from '@/connectors/postgres/models';
import { getTableColumns } from 'drizzle-orm';
import type { TTableColumns } from './types';

const columnCache = new WeakMap<TTableSchemaWithId, TTableColumns>();

export function getCachedColumns<Schema extends TTableSchemaWithId>(schema: Schema): TTableColumns {
  let columns = columnCache.get(schema);
  if (!columns) {
    columns = getTableColumns(schema);
    columnCache.set(schema, columns);
  }
  return columns;
}
