import { getError } from '@venizia/ignis-helpers/core';
import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
// Type-only: erased at compile time, so the no-eager-import guard is unaffected.
import type { Pool } from 'pg';
import { AbstractPostgresDataSource } from './abstract';
import type { IDatabaseTransaction, IDatabaseTransactionOptions, TIsolationLevel } from './common';
import { IsolationLevels } from './common';

/**
 * Postgres's half of the transaction seam: supplies the BEGIN statement the inherited
 * `beginTransaction()` delegates to, then attaches `isolationLevel` - a Postgres-only field the
 * neutral `IRelationalTransaction` has no concept of.
 */
export abstract class BasePostgresDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = Pool,
> extends AbstractPostgresDataSource<Settings, Schema, ConfigurableOptions, Client> {
  private resolveIsolationLevel(opts?: IDatabaseTransactionOptions): TIsolationLevel {
    const level = opts?.isolationLevel ?? IsolationLevels.READ_COMMITTED;

    // Validated, not assumed. The value is interpolated into SQL (see below), and
    // `ITransactionOptions.isolationLevel` is typed `string` in the kernel - so an arbitrary
    // string type-checks with no cast, and reaches the SIMPLE query protocol, which happily runs
    // several statements. `IsolationLevels.isValid` already existed and had no call site; every
    // sibling seam (`SqliteBeginModes.isValid`, `PoolerModes.isValid`) validates here.
    if (!IsolationLevels.isValid(level)) {
      throw getError({
        message: `[${this.constructor.name}][resolveIsolationLevel] Invalid isolation level | Got: '${level}' | Expected one of: ${[...IsolationLevels.SCHEME_SET].join(', ')}`,
      });
    }

    return level;
  }

  protected override buildBeginStatement(opts?: IDatabaseTransactionOptions): string {
    // Interpolated because it must be: `ISOLATION LEVEL $1` is not valid SQL, and postgres-js
    // tagged templates would bind it as a parameter. `resolveIsolationLevel` is what makes that
    // interpolation safe.
    return `BEGIN TRANSACTION ISOLATION LEVEL ${this.resolveIsolationLevel(opts)}`;
  }

  override async beginTransaction(
    opts?: IDatabaseTransactionOptions,
  ): Promise<IDatabaseTransaction<Schema>> {
    const transaction = await super.beginTransaction(opts);

    // Annotated so `TIsolationLevel` survives fresh-object-literal widening back to `string`.
    const patch: { isolationLevel: TIsolationLevel } = {
      isolationLevel: this.resolveIsolationLevel(opts),
    };

    return Object.assign(transaction, patch);
  }
}
