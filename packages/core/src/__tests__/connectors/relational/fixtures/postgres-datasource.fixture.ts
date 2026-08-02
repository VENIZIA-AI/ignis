import { BasePostgresDataSource } from '@/connectors/postgres/datasources';
import type { IDatabaseTransactionOptions } from '@/connectors/postgres/datasources';

/** Minimal Postgres datasource - never connected, only used to read `getQueryDialect()` / `getQueryExecutor()`. */
export class PostgresDataSourceFixture extends BasePostgresDataSource<{}> {
  constructor() {
    super({ name: 'postgres-datasource-fixture', config: {} });
  }

  getConnectionString(): string {
    return 'postgresql://fixture';
  }

  configure(): void {
    // no-op fixture - never touches a real backend.
  }

  /** Public passthrough to the protected `buildBeginStatement()`, so tests can assert the BEGIN seam without opening a real connection. */
  exposeBeginStatement(opts?: IDatabaseTransactionOptions): string {
    return this.buildBeginStatement(opts);
  }
}
