import { describe, test, expect } from 'bun:test';
import omit from 'lodash/omit';
import type { ISearchFieldDefinition } from '@/search/core/models';
import {
  defineSearchCollection,
  deriveSearchDocumentSchema,
  field,
  SearchFieldTypes,
  VectorDistances,
} from '@/search/core/models';

describe('search-collection DSL', () => {
  describe('field builders', () => {
    test('field.id() produces a required string id field', () => {
      expect(field.id()).toEqual({ name: 'id', type: 'string' });
    });

    test('field.string() produces the correct shape with flags', () => {
      expect(field.string('title', { searchable: true, optional: true })).toEqual({
        name: 'title',
        type: 'string',
        searchable: true,
        optional: true,
      });
    });

    test('field.strings() produces string[] type', () => {
      expect(field.strings('tags').type).toBe('string[]');
    });

    test('field.number() produces number type', () => {
      expect(field.number('price').type).toBe('number');
    });

    test('field.numbers() produces number[] type', () => {
      expect(field.numbers('scores').type).toBe('number[]');
    });

    test('field.boolean() produces boolean type', () => {
      expect(field.boolean('isActive').type).toBe('boolean');
    });

    test('field.booleans() produces boolean[] type', () => {
      expect(field.booleans('flags').type).toBe('boolean[]');
    });

    test('field.geopoint() produces geopoint type', () => {
      expect(field.geopoint('location').type).toBe('geopoint');
    });

    test('field.vector() produces vector type carrying dimensions/distance for a client-provided vector', () => {
      expect(field.vector('vec', { dimensions: 384, distance: 'cosine' })).toEqual({
        name: 'vec',
        type: 'vector',
        vector: { dimensions: 384, distance: 'cosine' },
      });
    });

    test('field.vector() produces vector type carrying embed for a server auto-embedded vector', () => {
      expect(
        field.vector('vec', { embed: { from: ['title'], model: { name: 'ts/all-MiniLM-L6-v2' } } }),
      ).toEqual({
        name: 'vec',
        type: 'vector',
        vector: { embed: { from: ['title'], model: { name: 'ts/all-MiniLM-L6-v2' } } },
      });
    });

    test('field.vector() carries optional at the top level, not nested under vector', () => {
      const result = field.vector('vec', { dimensions: 384, optional: true });

      expect(result).toEqual({
        name: 'vec',
        type: 'vector',
        vector: { dimensions: 384 },
        optional: true,
      });
    });

    test('field.vector() omits the optional key entirely when not set', () => {
      const result = field.vector('vec', { dimensions: 384 });

      expect(result).not.toHaveProperty('optional');
    });
  });

  describe('SearchFieldTypes.isValid', () => {
    test('accepts all eight canonical types', () => {
      expect(SearchFieldTypes.isValid('string')).toBe(true);
      expect(SearchFieldTypes.isValid('number')).toBe(true);
      expect(SearchFieldTypes.isValid('boolean')).toBe(true);
      expect(SearchFieldTypes.isValid('geopoint')).toBe(true);
      expect(SearchFieldTypes.isValid('string[]')).toBe(true);
      expect(SearchFieldTypes.isValid('number[]')).toBe(true);
      expect(SearchFieldTypes.isValid('boolean[]')).toBe(true);
      expect(SearchFieldTypes.isValid('vector')).toBe(true);
    });

    test('rejects unknown types', () => {
      expect(SearchFieldTypes.isValid('object')).toBe(false);
      expect(SearchFieldTypes.isValid('')).toBe(false);
    });
  });

  describe('VectorDistances.isValid', () => {
    test('accepts all three canonical distance metrics', () => {
      expect(VectorDistances.isValid('cosine')).toBe(true);
      expect(VectorDistances.isValid('ip')).toBe(true);
      expect(VectorDistances.isValid('l2')).toBe(true);
    });

    test('rejects unknown distance metrics', () => {
      expect(VectorDistances.isValid('euclidean')).toBe(false);
      expect(VectorDistances.isValid('')).toBe(false);
    });
  });

  describe('defineSearchCollection', () => {
    test('auto-prepends field.id() when missing', () => {
      const collection = defineSearchCollection({
        name: 'products',
        fields: [field.string('title')],
      });

      // Auto-prepend is runtime-only and the static type still shows the literal input with no `id`, so this widens to the plain interface to check the actual runtime value.
      expect((collection.fields as readonly ISearchFieldDefinition[])[0]).toEqual({
        name: 'id',
        type: 'string',
      });
      expect(collection.fields).toHaveLength(2);
    });

    test('keeps an explicit id field as-is', () => {
      const collection = defineSearchCollection({
        name: 'products',
        fields: [field.id(), field.string('title')],
      });

      expect(collection.fields).toHaveLength(2);
      expect(collection.fields[0]).toEqual({ name: 'id', type: 'string' });
    });

    test('throws when name is empty', () => {
      expect(() => defineSearchCollection({ name: '', fields: [field.string('title')] })).toThrow(
        /\[defineSearchCollection\]/,
      );
    });

    test('throws when there are no fields', () => {
      expect(() => defineSearchCollection({ name: 'products', fields: [] })).toThrow(
        /\[defineSearchCollection\]/,
      );
    });

    test('throws on duplicate field names', () => {
      expect(() =>
        defineSearchCollection({
          name: 'products',
          fields: [field.string('title'), field.string('title')],
        }),
      ).toThrow(/\[defineSearchCollection\]/);
    });

    test('throws when id field is not of type string', () => {
      expect(() =>
        defineSearchCollection({
          name: 'products',
          fields: [field.number('id'), field.string('title')],
        }),
      ).toThrow(/\[defineSearchCollection\]/);
    });

    test('throws when defaultSort references an unknown field', () => {
      expect(() =>
        defineSearchCollection({
          name: 'products',
          fields: [field.string('title')],
          defaultSort: 'unknown',
        }),
      ).toThrow(/\[defineSearchCollection\]/);
    });

    test('throws when defaultQueryBy references an unknown field, naming collection and field', () => {
      const build = () =>
        defineSearchCollection({
          name: 'products',
          fields: [field.string('title')],
          defaultQueryBy: ['title', 'headline'],
        });

      expect(build).toThrow(/products/);
      expect(build).toThrow(/headline/);
    });

    /**
     * Unlike `defaultSort`, the TYPE constraint lives here rather than in an engine compiler -
     * `defaultQueryBy` is a per-query parameter and never reaches one, so "defer to the engine's
     * compiler" is not an available option: it would be checked nowhere and surface at query time
     * as an engine error. And "full-text matching needs text" is not an engine choice the way
     * "default_sorting_field must be numeric" is.
     */
    test('throws when defaultQueryBy names a non-text field', () => {
      const build = () =>
        defineSearchCollection({
          name: 'products',
          fields: [field.string('title'), field.number('price')],
          defaultQueryBy: ['title', 'price'],
        });

      expect(build).toThrow(/price/);
      expect(build).toThrow(/number/);
    });

    test('accepts defaultQueryBy over string and string[] fields', () => {
      const collection = defineSearchCollection({
        name: 'products',
        fields: [field.string('title'), field.strings('tags')],
        defaultQueryBy: ['title', 'tags'],
      });

      expect(collection.defaultQueryBy).toEqual(['title', 'tags']);
    });

    // No "absent defaultQueryBy" case here: `<const T>` returns the caller's literal type, so a
    // collection that never declared the key does not HAVE it to assert on - the same reason
    // `defaultSort` has no such test. What matters behaviourally is pinned one tier up, in
    // repositories/default-query-by.test.ts.

    // The DSL only checks that the field exists; Typesense's numeric-scalar sort requirement is enforced later by compileTypesenseCollection, since other engines may sort on strings.
    test('accepts defaultSort referencing an existing STRING field (valid for other engines)', () => {
      const collection = defineSearchCollection({
        name: 'products',
        fields: [field.string('title')],
        defaultSort: 'title',
      });

      expect(collection.defaultSort).toBe('title');
    });

    test('accepts defaultSort referencing an existing number[] (array) field', () => {
      const collection = defineSearchCollection({
        name: 'products',
        fields: [field.numbers('scores')],
        defaultSort: 'scores',
      });

      expect(collection.defaultSort).toBe('scores');
    });

    test('accepts defaultSort referencing a scalar numeric field without explicit sortable flag', () => {
      const collection = defineSearchCollection({
        name: 'products',
        fields: [field.number('price')],
        defaultSort: 'price',
      });

      expect(collection.defaultSort).toBe('price');
    });
  });

  describe('deriveSearchDocumentSchema', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [
        field.string('title'),
        field.number('price'),
        field.boolean('inStock'),
        field.geopoint('location'),
        field.strings('tags'),
        field.number('rating', { optional: true }),
      ],
    });

    const validDocument = {
      id: '1',
      title: 'Widget',
      price: 9.99,
      inStock: true,
      location: [10.5, 20.5],
      tags: ['a', 'b'],
    };

    test('SELECT accepts a full valid document', () => {
      const schema = deriveSearchDocumentSchema({ definition, type: 'select' });
      const result = schema.safeParse(validDocument);

      expect(result.success).toBe(true);
    });

    test('SELECT rejects wrong field types', () => {
      const schema = deriveSearchDocumentSchema({ definition, type: 'select' });
      const result = schema.safeParse({ ...validDocument, price: 'not-a-number' });

      expect(result.success).toBe(false);
    });

    test('SELECT rejects malformed geopoint', () => {
      const schema = deriveSearchDocumentSchema({ definition, type: 'select' });
      const result = schema.safeParse({ ...validDocument, location: [1, 2, 3] });

      expect(result.success).toBe(false);
    });

    test('SELECT treats optional fields as optional', () => {
      const schema = deriveSearchDocumentSchema({ definition, type: 'select' });
      const docWithoutRating = omit(validDocument as typeof validDocument & { rating?: number }, [
        'rating',
      ]);
      const result = schema.safeParse(docWithoutRating);

      expect(result.success).toBe(true);
    });

    test('CREATE requires id even if not marked optional elsewhere', () => {
      const schema = deriveSearchDocumentSchema({ definition, type: 'create' });
      const docWithoutId = omit(validDocument, ['id']);
      const result = schema.safeParse(docWithoutId);

      expect(result.success).toBe(false);
    });

    test('CREATE accepts a full valid document', () => {
      const schema = deriveSearchDocumentSchema({ definition, type: 'create' });
      const result = schema.safeParse(validDocument);

      expect(result.success).toBe(true);
    });

    test('UPDATE accepts a partial document without id', () => {
      const schema = deriveSearchDocumentSchema({ definition, type: 'update' });
      const result = schema.safeParse({ title: 'New title' });

      expect(result.success).toBe(true);
    });

    test('UPDATE has no id key in its shape - unknown id is stripped, not validated', () => {
      const schema = deriveSearchDocumentSchema({ definition, type: 'update' });
      const result = schema.safeParse({ id: '1', title: 'New title' });

      expect(result.success).toBe(true);
      expect(result.success && result.data).toEqual({ title: 'New title' });
    });

    test('UPDATE still rejects wrong field types', () => {
      const schema = deriveSearchDocumentSchema({ definition, type: 'update' });
      const result = schema.safeParse({ price: 'nope' });

      expect(result.success).toBe(false);
    });

    test('throws for an invalid schema type', () => {
      expect(() =>
        deriveSearchDocumentSchema({
          definition,
          // @ts-expect-error - intentionally invalid to exercise the default branch
          type: 'bogus',
        }),
      ).toThrow(/\[deriveSearchDocumentSchema\]/);
    });
  });
});
