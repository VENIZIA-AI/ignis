import isEmpty from 'lodash/isEmpty';
import { getError } from '../../common/app-error';
import { TConstValue } from '../../common/types';

export class BindingScopes {
  static readonly SINGLETON = 'singleton';
  static readonly TRANSIENT = 'transient';
}
export type TBindingScope = TConstValue<typeof BindingScopes>;

export class BindingValueTypes {
  static readonly CLASS = 'class';
  static readonly VALUE = 'value';
  static readonly PROVIDER = 'provider';
}
export type TBindingValueType = TConstValue<typeof BindingValueTypes>;

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
