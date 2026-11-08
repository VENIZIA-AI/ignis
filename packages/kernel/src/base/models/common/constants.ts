import type { TConstValue } from '@venizia/ignis-helpers/common';

/** The schema variants an entity can produce (`getSchema({ type })`): select, create, update and execute. */
export class SchemaTypes {
  static readonly SELECT = 'select';
  static readonly UPDATE = 'update';
  static readonly CREATE = 'create';
  static readonly EXECUTE = 'execute';

  static readonly SCHEME_SET = new Set([this.SELECT, this.UPDATE, this.CREATE, this.EXECUTE]);

  static isValid(input: string): input is TSchemaType {
    return this.SCHEME_SET.has(input);
  }
}

/** Valid `SchemaTypes` values. */
export type TSchemaType = TConstValue<typeof SchemaTypes>;

/** The keys a write stamps, which a generated create or update body leaves out by default (`@model` `settings.properties.stamped`). */
export class AuditFields {
  static readonly CREATED_BY = 'createdBy';
  static readonly MODIFIED_BY = 'modifiedBy';
  static readonly CREATED_AT = 'createdAt';
  static readonly MODIFIED_AT = 'modifiedAt';
  static readonly DELETED_AT = 'deletedAt';

  static readonly SCHEME_SET = new Set<string>([
    this.CREATED_BY,
    this.MODIFIED_BY,
    this.CREATED_AT,
    this.MODIFIED_AT,
    this.DELETED_AT,
  ]);
}

/** What `@model` declares. Only ENTITY (a table-backed model) exists; `type` may be left out. */
export class ModelTypes {
  static readonly ENTITY = 'entity';
  static readonly SCHEME_SET = new Set([this.ENTITY]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid model type values. */
export type TModelType = TConstValue<typeof ModelTypes>;

/** The path-param id shape an entity family resolves to (`AbstractEntity.getIdType()`). */
export class IdSchemaTypes {
  static readonly NUMBER = 'number';
  static readonly STRING = 'string';

  static readonly SCHEME_SET = new Set<string>([this.NUMBER, this.STRING]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid id schema type values. */
export type TIdSchemaType = TConstValue<typeof IdSchemaTypes>;
