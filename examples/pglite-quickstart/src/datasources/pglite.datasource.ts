import { PGlite } from '@electric-sql/pglite';
import { datasource, TAnyDataSourceSchema } from '@venizia/ignis';
import { blankToUndefined } from '@venizia/ignis-helpers';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { PGliteDriver } from '@venizia/ignis/postgres/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface IPGliteSettings {
  /** A directory PGlite owns, or `undefined` for an in-memory database. */
  dataDir?: string;
}

/**
 * The schema is discovered from the repositories bound to this datasource. The fourth type
 * parameter is the raw client `getClient()` returns.
 */
@datasource({ driver: PGliteDriver })
export class PGliteDataSource extends BasePostgresDataSource<
  IPGliteSettings,
  TAnyDataSourceSchema,
  {},
  PGlite
> {
  constructor() {
    super({
      name: PGliteDataSource.name,
      config: { dataDir: blankToUndefined(process.env.APP_ENV_PGLITE_DATA_DIR) },
    });
  }

  override async configure(): Promise<void> {
    const { dataDir } = this.settings;

    // PGlite creates its data directory but not the folders above it.
    if (dataDir) {
      mkdirSync(dirname(dataDir), { recursive: true });
    }

    const client = new PGlite(dataDir);
    await client.waitReady;

    // PGlite locks its data directory, so the app applies migrations itself rather than the CLI.
    await migrate(drizzle({ client }), { migrationsFolder: './migration' });

    this.client = client;
  }

  override getConnectionString(): string {
    return this.settings.dataDir ?? ':memory:';
  }
}
