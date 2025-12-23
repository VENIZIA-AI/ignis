import { isClassConstructor } from '@venizia/ignis-inversion';

export type TNullable<T> = T | undefined | null;

export type AnyType = any;
export type AnyObject = Record<string | symbol | number, any>;

export type TOptions<T extends object = {}> = T;

export type ValueOrPromise<T> = T | Promise<T>;
export type ValueOf<T> = T[keyof T];

export type ValueOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type ValueOptionalExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;

export type TConstructor<T> = new (...args: any[]) => T;
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
export type TClass<T> = TConstructor<T> & { [property: string]: any };
export type TAbstractClass<T> = TAbstractConstructor<T> & { [property: string]: any };

export type TMixinTarget<T> = TConstructor<{ [P in keyof T]: T[P] }>;
export type TAbstractMixinTarget<T> = TAbstractConstructor<{ [P in keyof T]: T[P] }>;

export type TStringConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string>;
export type TNumberConstValue<T extends TClass<any>> = Extract<ValueOf<T>, number>;
export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;

export type TPrettify<T> = { [K in keyof T]: T[K] } & {};

export type TResolver<T> = (...args: any[]) => T;
export type TAsyncResolver<T> = (...args: any[]) => T | Promise<T>;
export type TValueOrResolver<T> = T | TResolver<T>;
export type TValueOrAsyncResolver<T> = T | TAsyncResolver<T>;

/**
 * Helper to resolve lazy value.
 * If valueOrResolver is:
 * - A class constructor: returns as-is
 * - An arrow/resolver function: calls it and returns result
 * - Any other value: returns as-is
 */
export const resolveValue = <T>(valueOrResolver: TValueOrResolver<T>): T => {
  if (typeof valueOrResolver !== 'function') {
    return valueOrResolver;
  }

  // If it's a class constructor, return as-is (it's the value itself)
  if (isClassConstructor(valueOrResolver as Function)) {
    return valueOrResolver as T;
  }

  // Otherwise it's a resolver function, call it
  return (valueOrResolver as TResolver<T>)();
};

/**
 * Helper to resolve lazy value (async version).
 * If valueOrResolver is:
 * - A class constructor: returns as-is
 * - An arrow/resolver function: calls it and awaits result
 * - Any other value: returns as-is
 */
export const resolveValueAsync = async <T>(
  valueOrResolver: TValueOrAsyncResolver<T>,
): Promise<T> => {
  if (typeof valueOrResolver !== 'function') {
    return valueOrResolver;
  }

  // If it's a class constructor, return as-is (it's the value itself)
  if (isClassConstructor(valueOrResolver as Function)) {
    return valueOrResolver as T;
  }

  // Otherwise it's a resolver function, call it and await
  return (valueOrResolver as TAsyncResolver<T>)();
};

/**
 * Helper to resolve lazy class references.
 * Handles string binding keys in addition to class/resolver patterns.
 */
export const resolveClass = <T>(
  ref: TClass<T> | TResolver<TClass<T>> | string,
): TClass<T> | string => {
  // String binding keys are returned as-is
  if (typeof ref === 'string') {
    return ref;
  }

  // Delegate to resolveValue for class/resolver handling
  return resolveValue(ref);
};

// --------------------------------------------------------------------------------------------------------
// Field Mapping Types
// --------------------------------------------------------------------------------------------------------
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

// --------------------------------------------------------------------------------------------------------
// Domain Types
// --------------------------------------------------------------------------------------------------------
export type TPermissionEffect = 'allow' | 'deny';

// --------------------------------------------------------------------------------------------------------
export type TInjectionGetter = <T>(opts: { key: string | symbol }) => T;

export interface IConfigurable<Options extends object = any, Result = any> {
  configure(opts?: Options): ValueOrPromise<Result>;
}

// --------------------------------------------------------------------------------------------------------
export type TAuthStrategy = 'jwt' | 'basic';

// --------------------------------------------------------------------------------------------------------
// JSX Types (re-exported from Hono for convenience)
// --------------------------------------------------------------------------------------------------------
export type { Child, FC, PropsWithChildren } from 'hono/jsx';
