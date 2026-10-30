import { Sorts } from './operators';
import type { TParsedOrderEntry } from './types';

/** @deprecated Use Sorts.parseEntry({ entry }). Removed in 0.5. */
export const parseOrderEntry = (opts: { entry: string }): TParsedOrderEntry =>
  Sorts.parseEntry(opts);
