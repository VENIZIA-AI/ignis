import type { TTableSchemaWithId } from '@/relational/core/models/common';
import type {
  IRelationalQueryDialect,
  ITransformedUpdateData,
} from '@/relational/core/repositories/common';
import { SqliteFilterBuilder } from './filter';
import { SqliteUpdateBuilder } from './update';

/**
 * The SQLite `IRelationalQueryDialect`: the neutral `FilterBuilder`'s filter translation plus the
 * SQLite-only JSON-path update composition (`json_set`) that `SqliteUpdateBuilder` owns. The two
 * stay in separate files so `SqliteFilterBuilder` keeps its zero sqlite-core imports.
 */
export class SqliteQueryDialect extends SqliteFilterBuilder implements IRelationalQueryDialect {
  private readonly _updateBuilder = new SqliteUpdateBuilder();

  /** The SQLite update transform, reachable for callers that need the raw builder. */
  get updateBuilder(): SqliteUpdateBuilder {
    return this._updateBuilder;
  }

  transformUpdate<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    data: Record<string, unknown>;
  }): ITransformedUpdateData {
    return this._updateBuilder.transform(opts);
  }

  toUpdateData(opts: { transformed: ITransformedUpdateData }): Record<string, unknown> {
    return this._updateBuilder.toUpdateData(opts);
  }
}
