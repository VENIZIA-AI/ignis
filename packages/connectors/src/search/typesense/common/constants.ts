import type { TConstValue } from '@venizia/ignis-helpers/common';

export class TypesenseImportActions {
  static readonly CREATE = 'create';
  static readonly UPSERT = 'upsert';
  static readonly UPDATE = 'update';
  static readonly EMPLACE = 'emplace';

  static readonly SCHEME_SET = new Set<string>([
    this.CREATE,
    this.UPSERT,
    this.UPDATE,
    this.EMPLACE,
  ]);

  static isValid(value: string): value is TTypesenseImportAction {
    return this.SCHEME_SET.has(value);
  }
}

export type TTypesenseImportAction = TConstValue<typeof TypesenseImportActions>;

export class TypesenseDirtyValues {
  static readonly COERCE_OR_REJECT = 'coerce_or_reject';
  static readonly COERCE_OR_DROP = 'coerce_or_drop';
  static readonly DROP = 'drop';
  static readonly REJECT = 'reject';

  static readonly SCHEME_SET = new Set<string>([
    this.COERCE_OR_REJECT,
    this.COERCE_OR_DROP,
    this.DROP,
    this.REJECT,
  ]);

  static isValid(value: string): value is TTypesenseDirtyValue {
    return this.SCHEME_SET.has(value);
  }
}

export type TTypesenseDirtyValue = TConstValue<typeof TypesenseDirtyValues>;
