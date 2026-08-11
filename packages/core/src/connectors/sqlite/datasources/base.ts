import type { TAnyDataSourceSchema } from '@/base/datasources';
import { throwNotSupported } from '@/utilities';
import type { ValueOrPromise } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import { AbstractSqliteDataSource } from './abstract';
import type {
  ISqliteDataSourceSettings,
  ISqliteTransaction,
  ISqliteTransactionOptions,
  TSqliteBeginMode,
} from './common';
import { SqliteBeginModes } from './common';

/**
 * SQLite's half of the transaction seam: supplies the BEGIN statement the inherited
 * `beginTransaction()` delegates to, then attaches `beginMode` - a SQLite-only field the neutral
 * `IRelationalTransaction` has no concept of.
 */
export abstract class BaseSqliteDataSource<
  Settings extends object = ISqliteDataSourceSettings,
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = unknown,
> extends AbstractSqliteDataSource<Settings, Schema, ConfigurableOptions, Client> {
  private resolveBeginMode(opts?: ISqliteTransactionOptions): TSqliteBeginMode {
    // Silently ignoring it would leave the caller believing SERIALIZABLE was honoured; every SQLite
    // transaction already is, so there is nothing to map it onto.
    if (opts?.isolationLevel) {
      throwNotSupported({
        scope: this.constructor.name,
        feature: `Isolation level '${opts.isolationLevel}' - SQLite has no isolation levels; pass \`beginMode\` (${SqliteBeginModes.DEFERRED} | ${SqliteBeginModes.IMMEDIATE} | ${SqliteBeginModes.EXCLUSIVE}) instead`,
        logger: this.logger,
      });
    }

    // IMMEDIATE, not DEFERRED: a deferred transaction takes its write lock at
    // the first write, and that upgrade fails outright with SQLITE_BUSY when
    // another writer got there first, where IMMEDIATE waits on the busy timeout.
    return this.assertBeginMode({ beginMode: opts?.beginMode ?? SqliteBeginModes.IMMEDIATE });
  }

  /**
   * The driver runs the BEGIN verbatim and never parameterized, so an
   * unchecked mode is raw interpolation into SQL. Matched as written -
   * SQLite's keywords are upper-case and nothing here normalises them.
   */
  private assertBeginMode(opts: { beginMode: string }): TSqliteBeginMode {
    const { beginMode } = opts;

    if (!SqliteBeginModes.isValid(beginMode)) {
      throw getError({
        message: `[${this.constructor.name}][assertBeginMode] Unknown beginMode '${beginMode}' | Expected ${SqliteBeginModes.DEFERRED} | ${SqliteBeginModes.IMMEDIATE} | ${SqliteBeginModes.EXCLUSIVE}`,
      });
    }

    return beginMode as TSqliteBeginMode;
  }

  /**
   * `beginTransaction()` settles the mode before delegating here; the assertion still runs so a
   * subclass calling this directly cannot interpolate an unchecked mode.
   */
  protected override buildBeginStatement(opts?: ISqliteTransactionOptions): string {
    const beginMode = this.assertBeginMode({
      beginMode: opts?.beginMode ?? SqliteBeginModes.IMMEDIATE,
    });

    return `BEGIN ${beginMode}`;
  }

  override async beginTransaction(
    opts?: ISqliteTransactionOptions,
  ): Promise<ISqliteTransaction<Schema>> {
    // Resolved once and handed down, so the refusal paths run a single time per
    // transaction rather than once here and once inside buildBeginStatement().
    const beginMode = this.resolveBeginMode(opts);

    const beginOptions: ISqliteTransactionOptions = { ...opts, beginMode };
    const transaction = await super.beginTransaction(beginOptions);

    // Annotated so `TSqliteBeginMode` survives fresh-object-literal widening back to `string`.
    const patch: { beginMode: TSqliteBeginMode } = { beginMode };

    return Object.assign(transaction, patch);
  }

  /**
   * libsql's url IS SQLite's connection string; an app
   * whose settings spell it differently overrides this.
   */
  override getConnectionString(): ValueOrPromise<string> {
    const { url } = this.settings as Partial<ISqliteDataSourceSettings>;

    if (!url) {
      throw getError({
        message: `[${this.constructor.name}][getConnectionString] No 'url' in settings | Carry the libsql url in config (\`:memory:\`, \`file:./data.db\`, \`libsql://...\`), or override getConnectionString()`,
      });
    }

    return url;
  }
}
