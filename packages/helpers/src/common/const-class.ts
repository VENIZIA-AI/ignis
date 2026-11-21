import { getError } from '@venizia/ignis-inversion';

import type { TConstValue } from './types';

/**
 * Base of a const class: a class whose `static readonly` string members are its values. Extend it and the
 * class reads its own values (`values`) and checks a candidate against them (`isValid`), so no class keeps a
 * `SCHEME_SET` and an `isValid` of its own.
 *
 * @example
 * class ArtifactTypes extends ConstClass {
 *   static readonly SERVICE = 'service';
 *   static readonly COMPONENT = 'component';
 * }
 * ArtifactTypes.isValid(input); // narrows `input` to 'service' | 'component'
 * z.enum(ArtifactTypes.values());
 */
export class ConstClass {
  private static readonly CACHE = new WeakMap<object, readonly string[]>();

  /** The string values of this class, in declaration order. Throws when the class holds none. */
  static values<T extends typeof ConstClass>(
    this: T,
  ): readonly [TConstValue<T>, ...TConstValue<T>[]] {
    let values = ConstClass.CACHE.get(this);

    if (!values) {
      values = Object.values(this).filter((value): value is string => typeof value === 'string');

      if (values.length === 0) {
        throw getError({ message: `${this.name} has no values` });
      }

      ConstClass.CACHE.set(this, values);
    }

    return values as unknown as readonly [TConstValue<T>, ...TConstValue<T>[]];
  }

  /** `true` when `value` is one of this class's values; narrows it to their union. */
  static isValid<T extends typeof ConstClass>(this: T, value: unknown): value is TConstValue<T> {
    return typeof value === 'string' && (this.values() as readonly string[]).includes(value);
  }
}
