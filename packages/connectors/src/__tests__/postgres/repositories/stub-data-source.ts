import type { TRelationalConnector } from '@/relational/postgres/datasources/common';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import type { IRelationalQueryDialect } from '@/relational/postgres/repositories/common';

/** A datasource that never connects: it hands a repository the connector (and, when asked, the dialect) a test gives it, and the real executor. */
export class StubDataSource extends BasePostgresDataSource<{}> {
  private readonly stubConnector?: () => TRelationalConnector;
  private readonly stubDialect?: IRelationalQueryDialect;

  constructor(opts?: {
    connector?: () => TRelationalConnector;
    dialect?: IRelationalQueryDialect;
  }) {
    super({ name: 'stub-data-source', config: {} });

    this.stubConnector = opts?.connector;
    this.stubDialect = opts?.dialect;
  }

  getConnectionString(): string {
    return 'postgresql://stub';
  }

  configure(): void {
    // Never touches a real backend.
  }

  override getConnector(): TRelationalConnector {
    if (!this.stubConnector) {
      throw new Error('[StubDataSource] No connector was given');
    }

    return this.stubConnector();
  }

  override getQueryDialect(): IRelationalQueryDialect {
    return this.stubDialect ?? super.getQueryDialect();
  }
}
