import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/connectors/postgres/models';
import type { IExtraOptions } from '@/base/repositories/common';
import { PersistableRelationalRepository } from './persistable';
import type { IDatabaseExtraOptions } from '../common';

/** Recommended base class for most repositories - full CRUD; `ExtraOptions` defaults to `IDatabaseExtraOptions` so `options.transaction.connector` needs no cast. */
export class DefaultRelationalRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IDatabaseExtraOptions,
> extends PersistableRelationalRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {}
