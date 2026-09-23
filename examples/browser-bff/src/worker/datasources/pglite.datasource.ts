import { PGlite } from '@electric-sql/pglite';
import { BasePostgresDataSource } from '@venizia/ignis-connectors/postgres';
import { PGliteDriver } from '@venizia/ignis-connectors/postgres/pglite';
import { IMigration, RelationalMigrationRunner } from '@venizia/ignis-connectors/relational';
import { datasource, TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import notesMigration from '../../../migration/0000_mushy_chimera.sql?raw';
import commentsMigration from '../../../migration/0001_silly_lightspeed.sql?raw';

interface IPGliteSettings {
  /** `opfs-ahp://<name>` for a database in the origin private file system, `undefined` for an in-memory one. */
  dataDir?: string;
}

/** A browser has no migration folder to read, so the files are inlined as text by `?raw`. */
const MIGRATIONS: IMigration[] = [
  { name: '0000_mushy_chimera', sql: notesMigration },
  { name: '0001_silly_lightspeed', sql: commentsMigration },
];

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
      config: { dataDir: import.meta.env.APP_ENV_PGLITE_DATA_DIR },
    });
  }

  override async configure(): Promise<void> {
    const client = new PGlite(this.settings.dataDir);
    await client.waitReady;
    this.client = client;

    try {
      await new RelationalMigrationRunner({
        driver: this.resolveDriver(),
        // Kept from earlier versions of this example, so a database already in OPFS stays readable.
        ledgerTable: 'ignis_browser_migrations',
        scope: PGliteDataSource.name,
      }).run({ migrations: MIGRATIONS });
    } catch (error) {
      // OPFS access handles are exclusive: an instance left open makes every retry fail until the
      // site data is cleared by hand. A failed close is logged so it cannot hide the real cause.
      await client.close().catch((closeError: unknown) => {
        this.logger.error('[configure] Failed to close PGlite | error: %s', closeError);
      });
      throw error;
    }
  }

  override getConnectionString(): string {
    return this.settings.dataDir ?? ':memory:';
  }
}
