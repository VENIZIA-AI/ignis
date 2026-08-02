import { BaseRelationalEntity } from '@/connectors/relational/models/base';
import type { TTableSchemaWithId } from './common';

/**
 * SQLite-bound entity base. The narrowed `Schema` keeps this barrel's `TTableObject` /
 * `TTableInsert` intersectable with a subclass's own schema type; the neutral `Table`-branded
 * bound would leave them uncomposable (TS2344).
 */
export class BaseSqliteEntity<
  Schema extends TTableSchemaWithId = TTableSchemaWithId,
> extends BaseRelationalEntity<Schema> {}
