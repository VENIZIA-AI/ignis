import type { TConstValue } from '@venizia/ignis-helpers/common';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** The schema variants an entity can produce (`getSchema({ type })`): select, create, update and execute. */
export class SchemaTypes extends ConstClass {
  static readonly SELECT = 'select';
  static readonly UPDATE = 'update';
  static readonly CREATE = 'create';
  static readonly EXECUTE = 'execute';
}

/** Valid `SchemaTypes` values. */
export type TSchemaType = TConstValue<typeof SchemaTypes>;

/** The keys a write stamps, which a generated create or update body leaves out by default (`@model` `settings.properties.stamped`). */
export class AuditFields extends ConstClass {
  static readonly CREATED_BY = 'createdBy';
  static readonly MODIFIED_BY = 'modifiedBy';
  static readonly CREATED_AT = 'createdAt';
  static readonly MODIFIED_AT = 'modifiedAt';
  static readonly DELETED_AT = 'deletedAt';
}

/** What `@model` declares. Only ENTITY (a table-backed model) exists; `type` may be left out. */
export class ModelTypes extends ConstClass {
  static readonly ENTITY = 'entity';
}

/** Valid model type values. */
export type TModelType = TConstValue<typeof ModelTypes>;

/** The path-param id shape an entity family resolves to (`AbstractEntity.getIdType()`). */
export class IdSchemaTypes extends ConstClass {
  static readonly NUMBER = 'number';
  static readonly STRING = 'string';
}

/** Valid id schema type values. */
export type TIdSchemaType = TConstValue<typeof IdSchemaTypes>;
