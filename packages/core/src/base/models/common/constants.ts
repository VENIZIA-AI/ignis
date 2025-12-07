import { TConstValue } from '@vez/ignis-helpers';

export class SchemaTypes {
  static readonly SELECT = 'select';
  static readonly UPDATE = 'update';
  static readonly CREATE = 'create';

  static readonly SCHEME_SET = new Set([this.SELECT, this.UPDATE, this.CREATE]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TSchemaType = TConstValue<typeof SchemaTypes>;
