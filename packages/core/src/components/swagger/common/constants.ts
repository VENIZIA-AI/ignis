import { TConstValue } from '@venizia/ignis-helpers';

export class DocumentUITypes {
  static readonly SWAGGER = 'swagger';
  static readonly SCALAR = 'scalar';

  static readonly SCHEME_SET = new Set([this.SWAGGER, this.SCALAR]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TRelationType = TConstValue<typeof DocumentUITypes>;
