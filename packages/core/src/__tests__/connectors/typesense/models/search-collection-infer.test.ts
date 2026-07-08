import { describe, test, expect } from 'bun:test';

import {
  defineSearchCollection,
  deriveSearchDocumentSchema,
  field,
  TSearchDocument,
} from '@/connectors/typesense/models';

/**
 * Compile-time document-type inference test. `tsc --noEmit` is the real gate here -
 * a misused `@ts-expect-error` fails the build, not `bun test`.
 */
const collection = defineSearchCollection({
  name: 'products',
  fields: [
    field.id(),
    field.string('title', { searchable: true }),
    field.number('price'),
    field.strings('tags', { optional: true }),
    field.geopoint('location'),
  ],
});

type TProductDocument = TSearchDocument<typeof collection>;

describe('TSearchDocument', () => {
  test('required fields must be present; optional fields may be omitted', () => {
    const withoutTags: TProductDocument = { id: '1', title: 'x', price: 1, location: [1, 2] };
    const withTags: TProductDocument = { ...withoutTags, tags: ['a'] };

    expect(withoutTags.tags).toBeUndefined();
    expect(withTags.tags).toEqual(['a']);
  });

  test('field types are inferred precisely (string/number/geopoint/string[])', () => {
    const doc: TProductDocument = { id: '1', title: 'x', price: 9.99, location: [10.5, 20.5] };

    // @ts-expect-error - price must be a number, not a string
    const badPrice: TProductDocument = { id: '1', title: 'x', price: 'oops', location: [1, 2] };

    // @ts-expect-error - title must be a string, not a number
    const badTitle: TProductDocument = { id: '1', title: 1, price: 1, location: [1, 2] };

    // @ts-expect-error - location must be a [number, number] tuple, not a bare array of 3
    const badGeopoint: TProductDocument = { id: '1', title: 'x', price: 1, location: [1, 2, 3] };

    // @ts-expect-error - tags must be string[], not number[]
    const badTags: TProductDocument = { ...doc, tags: [1, 2] };

    expect([doc, badPrice, badTitle, badGeopoint, badTags]).toHaveLength(5);
  });

  test('id is always required+string, and required fields cannot be omitted', () => {
    // @ts-expect-error - id is required
    const missingId: TProductDocument = { title: 'x', price: 1, location: [1, 2] };

    // @ts-expect-error - title is required (not marked optional in the collection)
    const missingTitle: TProductDocument = { id: '1', price: 1, location: [1, 2] };

    expect([missingId, missingTitle]).toHaveLength(2);
  });

  test('runtime sanity: the zod schema derived from the same collection accepts a value matching TProductDocument', () => {
    const schema = deriveSearchDocumentSchema({ definition: collection, type: 'select' });

    const value: TProductDocument = { id: '1', title: 'Widget', price: 9.99, location: [1, 2] };
    const result = schema.safeParse(value);

    expect(result.success).toBe(true);
  });
});

// engineOverrides has both known engine keys and an index signature for arbitrary ones -
// both must compile without breaking TSearchDocument.
const collectionWithEngineOverrides = defineSearchCollection({
  name: 'products-with-overrides',
  fields: [field.id(), field.string('title'), field.number('price')],
  engineOverrides: {
    elasticsearch: { mappings: { properties: {} } },
    customEngine: { anything: true },
  },
});

type TProductWithOverridesDocument = TSearchDocument<typeof collectionWithEngineOverrides>;

describe('engineOverrides - open index signature (H1)', () => {
  test('a known engine key and an arbitrary engine key both compile, TSearchDocument still infers', () => {
    const doc: TProductWithOverridesDocument = { id: '1', title: 'x', price: 1 };

    expect(doc).toEqual({ id: '1', title: 'x', price: 1 });
    expect(collectionWithEngineOverrides.engineOverrides?.customEngine).toEqual({
      anything: true,
    });
  });
});

// A client-provided vector field (no `embed`) participates in the document shape as `number[]`.
const collectionWithClientVector = defineSearchCollection({
  name: 'products-with-vector',
  fields: [
    field.id(),
    field.string('title'),
    field.vector('embedding', { dimensions: 384, distance: 'cosine' }),
  ],
});

type TProductWithClientVectorDocument = TSearchDocument<typeof collectionWithClientVector>;

describe('TSearchDocument - client-provided vector field', () => {
  test('the vector field is required and typed number[]', () => {
    const doc: TProductWithClientVectorDocument = {
      id: '1',
      title: 'x',
      embedding: [0.1, 0.2, 0.3],
    };

    const badEmbedding: TProductWithClientVectorDocument = {
      id: '1',
      title: 'x',
      // @ts-expect-error - embedding must be number[], not string[]
      embedding: ['a'],
    };

    // @ts-expect-error - embedding is required (not marked optional)
    const missingEmbedding: TProductWithClientVectorDocument = { id: '1', title: 'x' };

    expect([doc, badEmbedding, missingEmbedding]).toHaveLength(3);
    expect(collectionWithClientVector.name).toBe('products-with-vector');
  });
});

// A server auto-embedded vector field (`embed` set) is Typesense-generated - it must be entirely
// absent from the compile-time document shape, not merely optional.
const collectionWithAutoEmbedVector = defineSearchCollection({
  name: 'products-with-auto-embed',
  fields: [
    field.id(),
    field.string('title'),
    field.vector('embedding', {
      embed: { from: ['title'], model: { name: 'ts/all-MiniLM-L6-v2' } },
    }),
  ],
});

type TProductWithAutoEmbedDocument = TSearchDocument<typeof collectionWithAutoEmbedVector>;

describe('TSearchDocument - auto-embed vector field is omitted entirely', () => {
  test('the document type has no embedding key at all - assigning one is a compile error', () => {
    const doc: TProductWithAutoEmbedDocument = { id: '1', title: 'x' };

    const withEmbedding: TProductWithAutoEmbedDocument = {
      id: '1',
      title: 'x',
      // @ts-expect-error - embedding is server-generated (embed present); it must not be a settable key on the document type
      embedding: [0.1, 0.2],
    };

    expect([doc, withEmbedding]).toHaveLength(2);
    expect(collectionWithAutoEmbedVector.name).toBe('products-with-auto-embed');
  });
});
