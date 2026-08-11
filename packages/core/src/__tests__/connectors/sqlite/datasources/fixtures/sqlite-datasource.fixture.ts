import { datasource } from '@/base/metadata/persistents';
import type { ISqliteTransactionOptions } from '@/connectors/sqlite/datasources';
import { BaseSqliteDataSource } from '@/connectors/sqlite/datasources';
import { LibSqlDriver } from '@/connectors/sqlite/drivers/libsql';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType } from '@venizia/ignis-helpers';

/**
 * A real in-memory libsql database behind the real SQLite datasource, so BEGIN statements are
 * asserted where they actually reach the driver.
 */
@datasource({ driver: LibSqlDriver, autoDiscovery: false })
export class SqliteDataSourceFixture extends BaseSqliteDataSource<
  { url: string },
  AnyType,
  {},
  Client
> {
  /**
   * Every `opts` handed to `buildBeginStatement()`, so a test
   * can see what `beginTransaction()` resolved and passed down.
   */
  readonly beginStatementCalls: Array<ISqliteTransactionOptions | undefined> = [];

  constructor() {
    super({ name: 'sqlite-datasource-fixture', config: { url: ':memory:' }, schema: {} });
  }

  configure(): void {
    this.client = createClient({ url: this.getSettings().url });
  }

  protected override buildBeginStatement(opts?: ISqliteTransactionOptions): string {
    this.beginStatementCalls.push(opts);
    return super.buildBeginStatement(opts);
  }

  /** Passthrough to the protected `buildBeginStatement()`. */
  exposeBeginStatement(opts?: ISqliteTransactionOptions): string {
    return this.buildBeginStatement(opts);
  }
}
