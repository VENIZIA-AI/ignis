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
