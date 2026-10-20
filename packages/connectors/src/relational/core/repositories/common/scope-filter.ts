import { QueryOperators } from '@venizia/ignis-kernel';
import type { TWhere } from '@venizia/ignis-kernel';

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
