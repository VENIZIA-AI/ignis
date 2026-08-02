import type { TAnyDataSourceSchema } from '@/base/datasources';
// Type-only: erased at compile time, so the no-eager-import guard is unaffected.
import type { Pool } from 'pg';
import { AbstractPostgresDataSource } from './abstract';
import type { IDatabaseTransaction, IDatabaseTransactionOptions, TIsolationLevel } from './common';
import { IsolationLevels } from './common';

/**
 * Postgres's half of the transaction seam: supplies the BEGIN statement the engine-neutral
 * `beginTransaction()` (inherited through `AbstractPostgresDataSource`) delegates to, then
 * attaches `isolationLevel` to the returned handle - a Postgres-only field the neutral
 * `IRelationalTransaction` has no concept of.
 */
export abstract class BasePostgresDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = Pool,
> extends AbstractPostgresDataSource<Settings, Schema, ConfigurableOptions, Client> {
  private resolveIsolationLevel(opts?: IDatabaseTransactionOptions): TIsolationLevel {
    return opts?.isolationLevel ?? IsolationLevels.READ_COMMITTED;
  }

  protected override buildBeginStatement(opts?: IDatabaseTransactionOptions): string {
    // `isolationLevel` comes from the IsolationLevels const-class, never user input, and must be interpolated: `BEGIN TRANSACTION ISOLATION LEVEL $1` is not valid SQL and postgres-js tagged templates would bind it as a parameter.
    return `BEGIN TRANSACTION ISOLATION LEVEL ${this.resolveIsolationLevel(opts)}`;
  }

  override async beginTransaction(
    opts?: IDatabaseTransactionOptions,
  ): Promise<IDatabaseTransaction<Schema>> {
    const transaction = await super.beginTransaction(opts);

    // Annotated so `TIsolationLevel` (derived via `TConstValue`) survives fresh-object-literal widening back to `string`.
    const patch: { isolationLevel: TIsolationLevel } = {
      isolationLevel: this.resolveIsolationLevel(opts),
    };

    return Object.assign(transaction, patch);
  }
}
