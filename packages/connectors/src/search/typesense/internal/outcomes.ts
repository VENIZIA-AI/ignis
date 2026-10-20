import { type TConstValue } from '@venizia/ignis-helpers/common';

/**
 * What ONE `/multi_search` result entry turned out to be. The transport classifies; the two public
 * methods apply policy. `missingCollection` is separated from `failed` because they want opposite
 * treatment, and both now arrive through the same channel.
 */
export class EntryOutcomes {
  static readonly OK = 'ok';
  static readonly MISSING_COLLECTION = 'missingCollection';
  static readonly FAILED = 'failed';

  static readonly SCHEME_SET = new Set([this.OK, this.MISSING_COLLECTION, this.FAILED]);

  static isValid(value: string): value is TEntryOutcome {
    return this.SCHEME_SET.has(value);
  }
}
export type TEntryOutcome = TConstValue<typeof EntryOutcomes>;

export type TEntryClassification =
  | { kind: typeof EntryOutcomes.OK }
  | {
      kind: typeof EntryOutcomes.MISSING_COLLECTION | typeof EntryOutcomes.FAILED;
      message: string;
      code: number;
    };
