import { getError } from '../../error';
import { type TBindingKey, type TConstValue, type TTypeArgumentRequired } from '@/common/types';

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
  /**
   * Builds a binding key: `<namespace>.<key>`, or `key` alone without a namespace. The type argument names the value
   * bound under it and is required; `build<unknown>` is the explicit form for a key with no common value type.
   * In generic code, where `T` is not yet known, build `unknown` and return it as `TBindingKey<T>` (the brand is bivariant).
   *
   * ```ts
   * const MAILER = BindingKeys.build<IMailer>({ namespace: 'services', key: 'Mailer' });
   * container.get({ key: MAILER }); // IMailer
   * ```
   */
  static build<T = TTypeArgumentRequired>(
    opts: { namespace?: string; key: string } & ([T] extends [TTypeArgumentRequired]
      ? { 'build needs a type argument: build<T>': never }
      : unknown),
  ): TBindingKey<T> {
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

    return keyParts.join('.') as TBindingKey<T>;
  }
}
