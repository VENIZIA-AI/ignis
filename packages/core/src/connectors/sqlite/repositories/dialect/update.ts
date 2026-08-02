import type { TTableSchemaWithId } from '@/connectors/relational/models/common';
import type { ITransformedUpdateData } from '@/connectors/relational/repositories/common';
import { getCachedColumns } from '@/connectors/relational/repositories/common';
import { RelationalUpdateBuilder } from '@/connectors/relational/repositories/dialect';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { assertNotBlobJsonColumn } from './internal/json-column';
import { toSqliteJsonPaths } from './internal/json-path';

/**
 * Composes nested JSON path updates as chained `json_set` calls - SQLite's `jsonb_set`. The neutral
 * base owns the split and the path validation.
 */
export class SqliteUpdateBuilder extends RelationalUpdateBuilder {
  constructor() {
    super({ scope: SqliteUpdateBuilder.name });
  }

  override transform<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    data: Record<string, any>;
  }): ITransformedUpdateData {
    const { tableName, schema } = opts;

    const transformed = super.transform(opts);

    // Checked on the way out: the base keys `jsonExpressions` by
    // schema property, which is what resolves back to a column.
    const columns = getCachedColumns(schema);
    for (const columnName in transformed.jsonExpressions) {
      assertNotBlobJsonColumn({
        column: columns[columnName],
        tableName,
        scope: `[${SqliteUpdateBuilder.name}][transform]`,
      });
    }

    return transformed;
  }

  /**
   * Path and value are BOUND, never interpolated: unlike the extraction side, nothing here has to
   * survive `sql.raw`. `json(...)` is what keeps an object, an array or `true` from being stored as
   * a JSON string.
   */
  protected override composeJsonSet(opts: { target: SQL; path: string[]; value: any }): SQL {
    const { target, path, value } = opts;

    const serialized = JSON.stringify(value);

    // Chained rather than merged: an all-digit component yields both
    // readings, and only the one matching the stored shape applies.
    return toSqliteJsonPaths({ path }).reduce(
      (composed, literal) => sql`json_set(${composed}, ${literal}, json(${serialized}))`,
      target,
    );
  }
}
