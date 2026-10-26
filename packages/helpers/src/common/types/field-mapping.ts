import type { TConstValue } from './const-value';

/** The value kinds a field mapping reads. */
export class FieldMappingDataTypes {
  static readonly STRING = 'string';
  static readonly NUMBER = 'number';
  static readonly STRINGS = 'strings';
  static readonly NUMBERS = 'numbers';
  static readonly BOOLEAN = 'boolean';

  static readonly SCHEME_SET = new Set<string>([
    this.STRING,
    this.NUMBER,
    this.STRINGS,
    this.NUMBERS,
    this.BOOLEAN,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** Valid field mapping data type values. */
export type TFieldMappingDataType = TConstValue<typeof FieldMappingDataTypes>;

export interface IFieldMapping {
  name: string;
  type: TFieldMappingDataType;
  default?: string | number | Array<string> | Array<number> | boolean;
}

export type TFieldMappingNames<T extends Array<IFieldMapping>> = Extract<
  T[number],
  { type: Exclude<T[number]['type'], undefined> }
>['name'];

export type TObjectFromFieldMappings<
  T extends readonly {
    name: string;
    type: string;
    [extra: string | symbol]: any;
  }[],
> = {
  [K in T[number]['name']]: T extends {
    name: K;
    type: 'string';
    [extra: string | symbol]: any;
  }
    ? string
    : T extends { name: K; type: 'number'; [extra: string | symbol]: any }
      ? number
      : T extends { name: K; type: 'boolean'; [extra: string | symbol]: any }
        ? boolean
        : T extends { name: K; type: 'strings'; [extra: string | symbol]: any }
          ? string[]
          : T extends {
                name: K;
                type: 'numbers';
                [extra: string | symbol]: any;
              }
            ? number[]
            : never;
};
