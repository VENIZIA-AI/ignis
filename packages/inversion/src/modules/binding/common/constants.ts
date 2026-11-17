import { getError } from '../../error';
import { type TConstValue } from '@/common/types';

/** Lifetime of a resolved binding: `SINGLETON` caches the first value, `TRANSIENT` builds a new one on each `getValue`. */
export class BindingScopes {
  static readonly SINGLETON = 'singleton';
  static readonly TRANSIENT = 'transient';
}
/** Union of the `BindingScopes` values. */
export type TBindingScope = TConstValue<typeof BindingScopes>;

/** What a binding resolves from: a class to instantiate, a plain value, or a provider. */
export class BindingValueTypes {
  static readonly CLASS = 'class';
  static readonly VALUE = 'value';
  static readonly PROVIDER = 'provider';
}
/** Union of the `BindingValueTypes` values. */
export type TBindingValueType = TConstValue<typeof BindingValueTypes>;

/** Helpers for building binding keys. */
export class BindingKeys {
  static build(opts: { namespace: string; key: string }) {
    const { namespace, key } = opts;
    const keyParts: Array<string> = [];

    if (namespace) {
      keyParts.push(namespace);
    }

    if (!key) {
      throw getError({
        message: `[BindingKeys][build] Invalid key to build | key: ${key}`,
      });
    }

    keyParts.push(key);

    return keyParts.join('.');
  }
}
