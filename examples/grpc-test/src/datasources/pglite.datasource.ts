import { EnvKeys } from '@/common/env-keys';
import { PGlite } from '@electric-sql/pglite';
import { datasource, type TAnyDataSourceSchema } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis-connectors/postgres';
import { PGliteDriver } from '@venizia/ignis-connectors/postgres/pglite';
import { AppEnvs, ParseUtility } from '@venizia/ignis-helpers';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** What the datasource connects to. */
export interface IPGliteSettings {
  /** A directory PGlite owns, or `undefined` for an in-memory database. */
  dataDir?: string;
}

/** Postgres in this process: in memory unless `APP_ENV_PGLITE_DATA_DIR` names a folder. */
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
      config: {
        dataDir: ParseUtility.blankToUndefined({
          input: AppEnvs.get(EnvKeys.APP_ENV_PGLITE_DATA_DIR),
        }),
      },
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
