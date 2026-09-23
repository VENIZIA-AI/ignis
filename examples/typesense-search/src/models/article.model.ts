import { model } from '@venizia/ignis';
import {
  BaseSearchEntity,
  defineSearchCollection,
  field,
  TSearchDocument,
} from '@venizia/ignis/typesense';

// A search collection replaces a Drizzle pgTable: `field.*` declares the wire shape instead of
// column builders. `id` is auto-prepended, so it is never listed here.
@model({ type: 'entity' })
export class ArticleDocument extends BaseSearchEntity<typeof ArticleDocument.schema> {
  static override schema = defineSearchCollection({
    name: 'articles',
    fields: [
      field.string('title', { searchable: true, sortable: true }),
      field.string('content', { searchable: true }),
      field.string('category', { facet: true }),
    ],
  });
}

export type TArticleDocument = TSearchDocument<typeof ArticleDocument.schema>;
