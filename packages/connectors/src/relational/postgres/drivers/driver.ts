import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import type { TRelationalConnector } from '@/relational/postgres/datasources/common';
import type { IRelationalConnection, IRelationalDriver } from '@/relational/core/drivers';

export type { IStatementResult } from '@/relational/core/drivers';

/**
 * Postgres narrowing: the neutral `IRelationalConnection<TConnector>` is parameterized by the
 * connector type, not by `Schema`. Aliased rather than re-exported so callers keep writing
 * `TRelationalConnection<Schema>` and getting `connector: TRelationalConnector<Schema>`.
 */
export type TRelationalConnection<Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema> =
  IRelationalConnection<TRelationalConnector<Schema>>;

/** Postgres narrowing: the connector is always a `PgDatabase`. */
export type TRelationalDriver<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  Client = unknown,
> = IRelationalDriver<TRelationalConnector<Schema>, Client>;
