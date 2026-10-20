import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import type { IDatabaseTransactionOptions } from '@/relational/postgres/datasources';

/** Never connected - only used to read `getQueryDialect()` / `getQueryExecutor()`. */
export class PostgresDataSourceFixture extends BasePostgresDataSource<{}> {
  constructor() {
    super({ name: 'postgres-datasource-fixture', config: {} });
  }

  getConnectionString(): string {
    return 'postgresql://fixture';
  }

  configure(): void {
    // Never touches a real backend.
  }

  /** Passthrough to the protected `buildBeginStatement()` so tests can assert the BEGIN seam without a connection. */
  exposeBeginStatement(opts?: IDatabaseTransactionOptions): string {
    return this.buildBeginStatement(opts);
  }
}
