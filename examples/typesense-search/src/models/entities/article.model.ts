import { model } from '@venizia/ignis';
import {
  BaseSearchEntity,
  defineSearchCollection,
  field,
  TInferSearchDocument,
} from '@venizia/ignis/typesense';

/**
 * ArticleDocument - a pure search entity, no Drizzle `pgTable` anywhere.
 *
 * Demonstrates:
 * - `defineSearchCollection` + the `field` DSL in place of a Postgres schema
 * - `hiddenProperties` (internalNote is stripped from every response via Typesense `exclude_fields`)
 * - `defaultFilter` (only `published` articles are ever returned unless `shouldSkipDefaultFilter` is set)
 * - `defaultSort` on a numeric field (Typesense's `default_sorting_field` rejects string/array fields)
 */
@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['internalNote'],
    defaultFilter: { where: { status: 'published' } },
    defaultLimit: 20,
  },
})
export class ArticleDocument extends BaseSearchEntity<typeof ArticleDocument.schema> {
  static override schema = defineSearchCollection({
    name: 'articles',
    fields: [
      field.id(),
      field.string('title', { searchable: true, sortable: true }),
      field.string('content', { searchable: true }),
      field.string('category', { facet: true }),
      field.string('status', { facet: true }),
      field.number('views', { sortable: true, filterable: true }),
      field.number('publishedAt', { sortable: true, filterable: true }),
      field.strings('tags', { facet: true, optional: true }),
      // Indexed/filterable like any other field, but never leaves the server: hiddenProperties
      // excludes it via Typesense exclude_fields on every read, with no per-request override.
      field.string('internalNote', { optional: true }),
    ],
    defaultSort: 'publishedAt',
  });
}

export type TArticleDocument = TInferSearchDocument<typeof ArticleDocument.schema>;
