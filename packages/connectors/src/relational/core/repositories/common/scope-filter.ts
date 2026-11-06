import { QueryOperators, ScopeFilters } from '@venizia/ignis-kernel';
import type { TWhere } from '@venizia/ignis-kernel';
import type { TNullable } from '@venizia/ignis-helpers/common';

/**
 * The `where` that matches zero rows - shared by the repository tier's `applyScopeFilter` and the
 * dialect tier's `toInclude`, so an unresolved or denied row scope compiles to the same deny
 * predicate everywhere rather than two copies of a security predicate that could drift apart.
 */
export class ScopeFilterDenial {
  /** The empty `inq` compiles to `sql\`false\`` in every dialect, deterministically matching zero rows. */
  static where<DataObject = any>(): TWhere<DataObject> {
    return { id: { [QueryOperators.INQ]: [] } } as TWhere<DataObject>;
  }
}

/**
 * What a model's `access.resolve` returned, read once, the same way by the read path and the write guard.
 *
 * A scope is the symbol `ScopeFilters.UNRESTRICTED`, a usable `where`, or nothing (`null` / `undefined`). Anything else
 * is a resolver that built something wrong, such as `false`, `0`, `''`, a list, `{}`, or an object with a key that is
 * `undefined` (`{ merchantId: user.merchantId }` for a user without one). Reading it as "no restriction" would open
 * every row, so it is nothing: the scope was not resolved, and `onMissing` decides (deny by default).
 */
export class ScopeResolution {
  /** A non-empty plain object whose every value is defined, and whose `and` / `or` branches are themselves usable (an `and` has at least one). */
  private static isUsableWhere(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    const entries = Object.entries(value);

    if (entries.length === 0) {
      return false;
    }

    return entries.every(([key, entry]) => {
      if (entry === undefined) {
        return false;
      }

      // An empty `and` is "all of nothing", true for every row, so it restricts nothing. An empty `or` matches nothing and stays.
      if (key === QueryOperators.AND) {
        return (
          Array.isArray(entry) &&
          entry.length > 0 &&
          entry.every((branch) => ScopeResolution.isUsableWhere(branch))
        );
      }

      if (key === QueryOperators.OR) {
        return (
          Array.isArray(entry) && entry.every((branch) => ScopeResolution.isUsableWhere(branch))
        );
      }

      return true;
    });
  }

  static normalize<DataObject = any>(opts: {
    value: unknown;
  }): TNullable<TWhere<DataObject>> | typeof ScopeFilters.UNRESTRICTED {
    const { value } = opts;

    if (value === ScopeFilters.UNRESTRICTED) {
      return ScopeFilters.UNRESTRICTED;
    }

    if (value === null || value === undefined) {
      return value;
    }

    return ScopeResolution.isUsableWhere(value) ? (value as TWhere<DataObject>) : null;
  }
}
