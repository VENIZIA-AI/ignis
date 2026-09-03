import type { TTableSchemaWithId } from '@/relational/core/models/common';
import type {
  IRelationalQueryDialect,
  ITransformedUpdateData,
} from '@/relational/core/repositories/common';
import { PostgresFilterBuilder } from './filter';
import { UpdateBuilder } from './update';

/**
 * The Postgres `IRelationalQueryDialect`: the neutral `FilterBuilder`'s filter translation plus the
 * Postgres-only JSON-path update composition (`jsonb_set`, `::jsonb` literals) that `UpdateBuilder`
 * owns. The two stay in separate files so `FilterBuilder` keeps its zero pg-core imports.
 */
export class PostgresQueryDialect extends PostgresFilterBuilder implements IRelationalQueryDialect {
  private readonly _updateBuilder = new UpdateBuilder();

  /** The Postgres update transform, reachable for callers that need the raw builder. */
  get updateBuilder(): UpdateBuilder {
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
