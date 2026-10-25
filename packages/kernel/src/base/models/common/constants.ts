import type { TConstValue } from '@venizia/ignis-helpers/common';

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

export type TSchemaType = TConstValue<typeof SchemaTypes>;

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
