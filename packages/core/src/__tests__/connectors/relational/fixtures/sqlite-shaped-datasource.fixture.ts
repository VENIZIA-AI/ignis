import { getError } from '@venizia/ignis-helpers/core';
import { BaseRelationalDataSource } from '@/connectors/relational/datasources';
import type { TRelationalTransactionOptions } from '@/connectors/relational/datasources';
import type {
  IRelationalQueryDialect,
  IRelationalQueryExecutor,
} from '@/connectors/relational/repositories/common';

/**
 * A second engine shape - no isolation levels, its own `BEGIN IMMEDIATE` - proving
 * `buildBeginStatement()` is a real per-engine seam and not Postgres-only in disguise. No SQLite
 * driver is involved; the dialect and executor ports are never exercised and throw if called.
 */
export class SqliteShapedFixture extends BaseRelationalDataSource<{}> {
  constructor() {
    super({ name: 'sqlite-shaped-fixture', config: {} });
  }

  getConnectionString(): string {
    return 'file:fixture.db';
  }

  configure(): void {
    // Never touches a real backend.
  }

  protected override buildBeginStatement(_opts?: TRelationalTransactionOptions): string {
    return 'BEGIN IMMEDIATE';
  }

  override getQueryDialect(): IRelationalQueryDialect {
    throw getError({
      message: '[SqliteShapedFixture] getQueryDialect is not exercised by this fixture',
    });
  }

  override getQueryExecutor(): IRelationalQueryExecutor<unknown> {
    throw getError({
      message: '[SqliteShapedFixture] getQueryExecutor is not exercised by this fixture',
    });
  }

  /** Passthrough to the protected `buildBeginStatement()`. */
  exposeBeginStatement(opts?: TRelationalTransactionOptions): string {
    return this.buildBeginStatement(opts);
  }
}
