import type { TConstValue } from './const-value';

/** The value kinds a field mapping reads. */
export class FieldMappingDataTypes {
  static readonly STRING = 'string';
  static readonly NUMBER = 'number';
  static readonly STRINGS = 'strings';
  static readonly NUMBERS = 'numbers';
  static readonly BOOLEAN = 'boolean';
}

/** Valid field mapping data type values. */
export type TFieldMappingDataType = TConstValue<typeof FieldMappingDataTypes>;

/** Describes one field to read: its `name`, its value `type`, and an optional `default`. */
export interface IFieldMapping {
  name: string;
  type: TFieldMappingDataType;
  default?: string | number | Array<string> | Array<number> | boolean;
}

/** The union of `name` values in a list of field mappings. */
export type TFieldMappingNames<T extends Array<IFieldMapping>> = Extract<
  T[number],
  { type: Exclude<T[number]['type'], undefined> }
>['name'];

/** The object a list of field mappings yields: one key per `name`, typed from its `type` (`string`, `number`, `boolean`, `strings` or `numbers`). Needs the list typed as a literal (`as const`) to narrow. */
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
