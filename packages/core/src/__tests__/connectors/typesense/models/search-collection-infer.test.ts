import { describe, test, expect } from 'bun:test';

import {
  defineSearchCollection,
  deriveSearchDocumentSchema,
  field,
  TInferSearchDocument,
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

type TProductDocument = TInferSearchDocument<typeof collection>;

describe('TInferSearchDocument', () => {
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
// both must compile without breaking TInferSearchDocument.
const collectionWithEngineOverrides = defineSearchCollection({
  name: 'products-with-overrides',
  fields: [field.id(), field.string('title'), field.number('price')],
  engineOverrides: {
    elasticsearch: { mappings: { properties: {} } },
    customEngine: { anything: true },
  },
});

type TProductWithOverridesDocument = TInferSearchDocument<typeof collectionWithEngineOverrides>;

describe('engineOverrides - open index signature (H1)', () => {
  test('a known engine key and an arbitrary engine key both compile, TInferSearchDocument still infers', () => {
    const doc: TProductWithOverridesDocument = { id: '1', title: 'x', price: 1 };

    expect(doc).toEqual({ id: '1', title: 'x', price: 1 });
    expect(collectionWithEngineOverrides.engineOverrides?.customEngine).toEqual({
      anything: true,
    });
  });
});
