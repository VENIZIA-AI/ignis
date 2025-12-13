import isEmpty from 'lodash/isEmpty';
import { Container } from './../container';
import { getError } from './app-error';

// --------------------------------------------------------------------------------------------------------
export type TNullable<T> = T | undefined | null;

export type ValueOrPromise<T> = T | Promise<T>;
export type ValueOf<T> = T[keyof T];

export type TConstructor<T> = new (...args: any[]) => T;
export type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
export type TClass<T> = TConstructor<T> & { [property: string]: any };

export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;

// --------------------------------------------------------------------------------------------------------
export interface IProvider<T> {
  value(container: Container): T;
}

export const isClass = <T>(target: any): target is TClass<T> => {
  return typeof target === 'function' && target.prototype !== undefined;
};

export const isClassProvider = <T>(target: any): target is TClass<IProvider<T>> => {
  return (
    typeof target === 'function' && target.prototype && typeof target.prototype.value === 'function'
  );
};

// -----------------------------------------------------------------------
export class BindingScopes {
  static readonly SINGLETON = 'singleton';
  static readonly TRANSIENT = 'transient';
}
export type TBindingScope = TConstValue<typeof BindingScopes>;

// -----------------------------------------------------------------------
export class BindingValueTypes {
  static readonly CLASS = 'class';
  static readonly VALUE = 'value';
  static readonly PROVIDER = 'provider';
}

export type TBindingValueType = TConstValue<typeof BindingValueTypes>;

// -----------------------------------------------------------------------
export interface IBindingTag {
  [name: string]: any;
}

// -----------------------------------------------------------------------
export class BindingKeys {
  static build(opts: { namespace: string; key: string }) {
    const { namespace, key } = opts;
    const keyParts: Array<string> = [];
    if (!isEmpty(namespace)) {
      keyParts.push(namespace);
    }

    if (isEmpty(key)) {
      throw getError({
        message: `[BindingKeys][build] Invalid key to build | key: ${key}`,
      });
    }

    keyParts.push(key);
    return keyParts.join('.');
  }
}

// -----------------------------------------------------------------------
export interface IPropertyMetadata {
  bindingKey: string | symbol;
  isOptional?: boolean;
  [key: string]: any;
}

export interface IInjectMetadata {
  key: string | symbol;
  index: number;
  isOptional?: boolean;
}

export interface IInjectableMetadata {
  scope?: TBindingScope;
  tags?: Record<string, any>;
}
