import { createClient, type Client } from '@libsql/client';
import { datasource, TAnyDataSourceSchema } from '@venizia/ignis';
import { blankToUndefined } from '@venizia/ignis-helpers';
import { BaseSqliteDataSource } from '@venizia/ignis/sqlite';
import { LibSqlDriver } from '@venizia/ignis/sqlite/libsql';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface ISqliteSettings {
  /** `file:` for a local database, `:memory:` to die with the process. Remote Turso cannot hold an
   * explicit transaction. */
  url: string;
}

/** Runtime state lives under `app_data/`, which is gitignored repository-wide. */
const DEFAULT_URL = 'file:./app_data/database/local.db';

/**
 * The schema is discovered from the repositories bound to this datasource. The fourth type
 * parameter is the raw client `getClient()` returns.
 */
@datasource({ driver: LibSqlDriver })
export class SqliteDataSource extends BaseSqliteDataSource<
  ISqliteSettings,
  TAnyDataSourceSchema,
  {},
  Client
> {
  constructor() {
    super({
      name: SqliteDataSource.name,
      config: { url: blankToUndefined(process.env.APP_ENV_SQLITE_URL) ?? DEFAULT_URL },
    });
  }

  override async configure(): Promise<void> {
    const { url } = this.settings;

    // libsql opens a database file but never creates its parent, so a missing `app_data/database`
    // is a `SQLITE_CANTOPEN` at boot rather than a fresh database.
    const filePath = url.replace(/^file:/, '');
    if (filePath !== url) {
      mkdirSync(dirname(filePath), { recursive: true });
    }

    const client = createClient({ url });

    // Applied in-process rather than by the CLI: an embedded database ships with the app, so there
    // is no deploy step between generating a migration and needing it. `migrate()` records what it
    // has run in `__drizzle_migrations`, so every boot after the first is a no-op.
    await migrate(drizzle({ client }), { migrationsFolder: './migration' });

    this.client = client;
  }

  override getConnectionString(): string {
    return this.settings.url;
  }
}
