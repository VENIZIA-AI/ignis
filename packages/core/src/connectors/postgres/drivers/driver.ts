import type { TAnyDataSourceSchema } from '@/base/datasources';
import type { TRelationalConnector } from '@/connectors/postgres/datasources/common';
import type { IRelationalConnection, IRelationalDriver } from '@/connectors/relational/drivers';

export type { IStatementResult } from '@/connectors/relational/drivers';

/**
 * Postgres narrowing: the neutral `IRelationalConnection<TConnector>` is parameterized directly by
 * the connector type, not by `Schema` - a straight re-export would silently redefine what the type
 * parameter means for every existing caller, which still writes `IRelationalConnection<Schema>`
 * expecting `connector: TRelationalConnector<Schema>`. Aliased instead, exactly like
 * `IRelationalDriver` below, so `NodePostgresDriver` and `PostgresJsDriver` need no changes.
 */
export type TRelationalConnection<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> =
  IRelationalConnection<TRelationalConnector<Schema>>;

/** Postgres narrowing: the connector is always a `PgDatabase`. Existing drivers implement this unchanged. */
export type TRelationalDriver<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  Client = unknown,
> = IRelationalDriver<TRelationalConnector<Schema>, Client>;
