import { TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { IExtraOptions } from '../common';
import { PersistableRepository } from './persistable';

/**
 * Default CRUD repository with dependency injection support.
 *
 * This is the recommended base class for most repositories.
 *
 * IMPORTANT: Both `model` AND `dataSource` are required in @repository for schema auto-discovery.
 * Without both, the model won't be registered and relational queries will fail.
 *
 * Supports these injection patterns:
 *
 * 1. Zero boilerplate (recommended):
 * ```typescript
 * @repository({ model: User, dataSource: PostgresDataSource })
 * export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
 *   // No constructor needed - datasource auto-injected at param index 0
 *
 *   async findByEmail(email: string) {
 *     return this.findOne({ filter: { where: { email } } });
 *   }
 * }
 * ```
 *
 * 2. Explicit @inject with @repository - when you need constructor control:
 * ```typescript
 * @repository({ model: User, dataSource: PostgresDataSource })
 * export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
 *   constructor(
 *     @inject({ key: 'datasources.PostgresDataSource' })
 *     ds: PostgresDataSource,
 *   ) {
 *     super(ds, { entityClass: User });
 *   }
 * }
 * ```
 * Note: When @inject is at param index 0, auto-injection is skipped (your @inject takes precedence).
 */
export class DefaultCRUDRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends PersistableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {}
