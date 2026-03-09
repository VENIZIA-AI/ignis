import { TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { IExtraOptions } from '../common';
import { PersistableRepository } from './persistable';

/** Recommended base class for most repositories. Extends PersistableRepository with full CRUD. */
export class DefaultCRUDRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IExtraOptions,
> extends PersistableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {}
