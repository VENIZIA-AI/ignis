import type { CollectionSchema } from 'typesense/lib/Typesense/Collection';
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';

/* eslint-disable @typescript-eslint/naming-convention -- the engine's wire names */
/** The schema the engine answers for a collection: what the create sent, every other field at its empty value. */
export const toFakeSchema = (schema: CollectionCreateSchema): CollectionSchema => ({
  default_sorting_field: '',
  symbols_to_index: [],
  token_separators: [],
  enable_nested_fields: false,
  metadata: {},
  voice_query_model: {},
  synonym_sets: [],
  curation_sets: [],
  created_at: 0,
  num_documents: 0,
  num_memory_shards: 0,
  ...schema,
});
