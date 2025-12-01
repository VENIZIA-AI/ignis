import { TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { PersistableRepository } from './persistable';
import { TNullable } from '@/common/types';

export class DefaultCRUDRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends TNullable<object> = undefined,
> extends PersistableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {}
