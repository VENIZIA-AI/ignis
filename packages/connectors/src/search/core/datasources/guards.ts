import type { ISearchCollectionDefinition } from '@/search/core/models';

/** A pg entity's `schema` is a pgTable, not an `ISearchCollectionDefinition` - narrows by shape so a pgTable is never mistaken for and provisioned as a search collection. */
export const isSearchCollectionDefinition = (
  value: unknown,
): value is ISearchCollectionDefinition => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'fields' in value &&
    Array.isArray(value.fields)
  );
};
