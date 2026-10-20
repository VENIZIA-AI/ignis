/** Narrows one `unknown` `IImportResult.responses` row enough to read the per-row `success` flag `createAll` filters on. */
export const isImportRowLike = (value: unknown): value is { success?: boolean } => {
  return typeof value === 'object' && value !== null;
};
