import { Container } from '@/helpers/inversion';

// ----------------------------------------------------------------------------------------------------------------------------------------
export type TNullable = undefined | null | void;

export type AnyType = any;
export type AnyObject = Record<string | symbol | number, any>;

export type ValueOrPromise<T> = T | Promise<T>;
export type ValueOf<T> = T[keyof T];

export type ValueOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type ValueOptionalExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;

export type ClassProps<T> = ValueOf<T>;

export type TConstructor<T> = new (...args: any[]) => T;

export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
export interface IClass<T> {
  new (...args: any[]): T;
  [property: string]: any;
}

export type TMixinTarget<T> = TConstructor<{ [P in keyof T]: T[P] }>;
export type TAbstractMixinTarget<T> = TAbstractConstructor<{ [P in keyof T]: T[P] }>;

export type TStringConstValue<T extends IClass<any>> = Extract<ValueOf<T>, string>;
export type TNumberConstValue<T extends IClass<any>> = Extract<ValueOf<T>, number>;
export type TConstValue<T extends IClass<any>> = Extract<ValueOf<T>, string | number>;

export type TPrettify<T> = { [K in keyof T]: T[K] } & {};

// ----------------------------------------------------------------------------------------------------------------------------------------
// Field Mapping Types
// ----------------------------------------------------------------------------------------------------------------------------------------
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

// ----------------------------------------------------------------------------------------------------------------------------------------
// Domain Types
// ----------------------------------------------------------------------------------------------------------------------------------------
export type TPermissionEffect = 'allow' | 'deny';

// ----------------------------------------------------------------------------------------------------------------------------------------
// Injection Getter
// ----------------------------------------------------------------------------------------------------------------------------------------
export type TInjectionGetter = <T>(key: string | symbol) => T;

// ----------------------------------------------------------------------------------------------------------------------------------------
// Provider
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IProvider<T> {
  value(container?: Container): T;
}

export const isClassProvider = <T>(target: any): target is IClass<IProvider<T>> => {
  return (
    typeof target === 'function' && target.prototype && typeof target.prototype.value === 'function'
  );
};
