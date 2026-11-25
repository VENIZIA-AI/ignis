import { type TConstValue, ConstClass } from '@venizia/ignis-helpers/common';

/**
 * What ONE `/multi_search` result entry turned out to be. The transport classifies; the two public
 * methods apply policy. `missingCollection` is separated from `failed` because they want opposite
 * treatment, and both now arrive through the same channel.
 */
export class EntryOutcomes extends ConstClass {
  static readonly OK = 'ok';
  static readonly MISSING_COLLECTION = 'missingCollection';
  static readonly FAILED = 'failed';
}
export type TEntryOutcome = TConstValue<typeof EntryOutcomes>;

export type TEntryClassification =
  | { outcome: typeof EntryOutcomes.OK }
  | {
      outcome: typeof EntryOutcomes.MISSING_COLLECTION | typeof EntryOutcomes.FAILED;
      message: string;
      code: number;
    };
