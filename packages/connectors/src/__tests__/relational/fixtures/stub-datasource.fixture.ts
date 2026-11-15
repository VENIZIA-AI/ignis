import { BaseRelationalDataSource } from '@/relational/core/datasources';
import type { TRelationalTransactionOptions } from '@/relational/core/datasources';
import type {
  IRelationalQueryDialect,
  IRelationalQueryExecutor,
} from '@/relational/core/repositories/common';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/relational/postgres/repositories/executor';

/** Never connected: hands a repository the Postgres dialect and executor and the connector a test stubbed. */
export class StubDataSource extends BaseRelationalDataSource {
  private readonly stubbedConnector: unknown;

  constructor(opts: { connector: unknown }) {
    super({ name: 'stub-datasource', config: {} });

    this.stubbedConnector = opts.connector;
  }

  configure(): void {
    // Never touches a real backend.
  }

  getConnectionString(): string {
    return 'stub://memory';
  }

  protected override buildBeginStatement(_opts?: TRelationalTransactionOptions): string {
    return 'BEGIN';
  }

  override getQueryDialect(): IRelationalQueryDialect {
    return new PostgresQueryDialect();
  }

  override getQueryExecutor(): IRelationalQueryExecutor<unknown> {
    return new PostgresQueryExecutor();
  }

  override getConnector(): unknown {
    return this.stubbedConnector;
  }
}
