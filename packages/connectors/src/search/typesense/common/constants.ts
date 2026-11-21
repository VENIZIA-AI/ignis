import type { TConstValue } from '@venizia/ignis-helpers/common';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** Values of the import `action` option; `create` is used when none is given. */
export class TypesenseImportActions extends ConstClass {
  static readonly CREATE = 'create';
  static readonly UPSERT = 'upsert';
  static readonly UPDATE = 'update';
  static readonly EMPLACE = 'emplace';
}

/** Union of the `TypesenseImportActions` values. */
export type TTypesenseImportAction = TConstValue<typeof TypesenseImportActions>;

/** Values of the import `dirtyValues` option, which selects how the engine treats a field value that does not match its declared type. */
export class TypesenseDirtyValues extends ConstClass {
  static readonly COERCE_OR_REJECT = 'coerce_or_reject';
  static readonly COERCE_OR_DROP = 'coerce_or_drop';
  static readonly DROP = 'drop';
  static readonly REJECT = 'reject';
}

/** Union of the `TypesenseDirtyValues` values. */
export type TTypesenseDirtyValue = TConstValue<typeof TypesenseDirtyValues>;
