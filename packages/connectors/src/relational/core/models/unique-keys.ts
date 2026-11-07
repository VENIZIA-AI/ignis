import type { IUniqueKey, TTableSchemaWithId } from './common';
import { UniqueKeyReader } from './common/unique-key-reader';

/**
 * Typed handles on the unique keys a table declares, for `upsert({ on })`. Declare each one once, next to the table or
 * as a `static keys` of the entity: `UniqueKeys.of` runs when that module loads, so a wrong name fails at boot, not at
 * the first upsert.
 */
export class UniqueKeys {
  /**
   * The unique index, unique constraint or unique column named `index` on `table`. Throws when no key of the table has
   * that name, when the index is not unique, when one of its columns is an expression (`lower(email)`), or when the
   * table is neither a Postgres nor a SQLite table. A partial index keeps its predicate in `where`; write that predicate
   * with literals, not a bound value, as SQLite cannot match a partial index from a bound parameter. The primary key needs
   * no handle: `upsert` uses it when `on` is omitted.
   * @example
   * ```typescript
   * import { UniqueKeys } from '@venizia/ignis-connectors/relational';
   * import { sql } from 'drizzle-orm';
   * import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
   *
   * const cache = pgTable(
   *   'SelfOrderCache',
   *   {
   *     id: uuid('id').primaryKey().defaultRandom(),
   *     merchantId: text('merchant_id').notNull(),
   *     cacheKey: text('cache_key').notNull(),
   *     deletedAt: timestamp('deleted_at'),
   *   },
   *   (t) => [
   *     uniqueIndex('self_order_cache_merchant_key')
   *       .on(t.merchantId, t.cacheKey)
   *       .where(sql`${t.deletedAt} is null`),
   *   ],
   * );
   * const merchantCacheKey = UniqueKeys.of({ table: cache, index: 'self_order_cache_merchant_key' });
   * ```
   */
  static of<Schema extends TTableSchemaWithId>(opts: {
    table: Schema;
    index: string;
  }): IUniqueKey<Schema> {
    return UniqueKeyReader.named(opts);
  }
}
