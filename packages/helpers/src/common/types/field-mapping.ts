export type TFieldMappingDataType = 'string' | 'number' | 'strings' | 'numbers' | 'boolean';
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
