import { model } from '@venizia/ignis';
import {
  BaseSearchEntity,
  defineSearchCollection,
  field,
  TSearchDocument,
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

      // Auto-embedding - Typesense builds the vector from title+content at index time, so
      // `search({ mode: 'semantic', queryText })` works with no embedding pipeline in the app.
      // Remote provider (Google/Gemini) - the API key is read from env, NEVER hardcoded into the schema:
      field.vector('embedding', {
        // gemini-embedding-001 defaults to 3072; 1536 (Matryoshka) is requested via num_dim.
        dimensions: 1536,
        embed: {
          from: ['title', 'content'],
          model: {
            url: 'https://generativelanguage.googleapis.com/v1beta/openai',
            name: 'openai/gemini-embedding-001',
            apiKey: process.env.APP_ENV_GOOGLE_API_KEY ?? '',
          },
        },
      }),
      // Local built-in model instead (runs on the Typesense server, no key, no external calls):
      //   field.vector('embedding', { embed: { from: ['title', 'content'], model: { name: 'ts/all-MiniLM-L6-v2' } } })
      // Or client-provided vectors (you compute + send the embedding yourself):
      //   field.vector('embedding', { dimensions: 384, distance: VectorDistances.COSINE })
      // Auto-embedded fields are omitted from TSearchDocument (the server owns them).
    ],
    defaultSort: 'publishedAt',

    // Query-time expansion, provisioned alongside the collection. Multi-way (no `root`): every term
    // matches the others. One-way (`root` set): a query for the root also matches the synonyms.
    synonyms: [
      { id: 'ml', synonyms: ['ml', 'machine learning', 'deep learning'] },
      { id: 'js', root: 'javascript', synonyms: ['js', 'ecmascript', 'nodejs'] },
    ],
  });
}

export type TArticleDocument = TSearchDocument<typeof ArticleDocument.schema>;
