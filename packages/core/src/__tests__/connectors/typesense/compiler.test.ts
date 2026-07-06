import { describe, expect, test } from 'bun:test';

import { compileTypesenseCollection } from '@/connectors/typesense/compiler';
import { defineSearchCollection, field } from '@/connectors/typesense/models';

describe('compileTypesenseCollection', () => {
  test('compiles a full definition to the exact expected CollectionCreateSchema', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [
        field.string('title', { searchable: true }),
        field.number('price', { facet: true }),
        field.boolean('inStock'),
        field.geopoint('location'),
        field.strings('tags', { facet: true }),
        field.numbers('scores'),
        field.booleans('flags'),
        field.number('rating', { optional: true, sortable: true }),
      ],
      defaultSort: 'rating',
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema).toEqual({
      name: 'products',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'price', type: 'float', facet: true },
        { name: 'inStock', type: 'bool' },
        { name: 'location', type: 'geopoint' },
        { name: 'tags', type: 'string[]', facet: true },
        { name: 'scores', type: 'float[]' },
        { name: 'flags', type: 'bool[]' },
        { name: 'rating', type: 'float', optional: true, sort: true },
      ],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Typesense wire field.
      default_sorting_field: 'rating',
    });
  });

  test('omits the id field from the compiled fields list', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.id(), field.string('title')],
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema.fields.find(item => item.name === 'id')).toBeUndefined();
    expect(schema.fields).toEqual([{ name: 'title', type: 'string' }]);
  });

  test('maps every DSL field type to its Typesense wire type', () => {
    const definition = defineSearchCollection({
      name: 'catalog',
      fields: [
        field.string('a'),
        field.number('b'),
        field.boolean('c'),
        field.geopoint('d'),
        field.strings('e'),
        field.numbers('f'),
        field.booleans('g'),
      ],
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema.fields.map(item => item.type)).toEqual([
      'string',
      'float',
      'bool',
      'geopoint',
      'string[]',
      'float[]',
      'bool[]',
    ]);
  });

  test('emits sort: true for a string field with sortable: true', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.string('title', { sortable: true })],
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema.fields).toEqual([{ name: 'title', type: 'string', sort: true }]);
  });

  test('does not emit a sort key for a field without the sortable flag', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.string('title'), field.number('price')],
    });

    const schema = compileTypesenseCollection({ definition });

    for (const compiledField of schema.fields) {
      expect(compiledField).not.toHaveProperty('sort');
    }
  });

  // default_sorting_field requires a scalar numeric field; sortable only affects sort_by
  // eligibility. The DSL only checks the field exists, so this is a compile-time-only rejection.
  test('defaultSort on a sortable STRING field is rejected at compile time, not definition time', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.string('title', { sortable: true })],
      defaultSort: 'title',
    });

    expect(() => compileTypesenseCollection({ definition })).toThrow(
      /\[compileTypesenseCollection\]/,
    );
  });

  test('defaultSort on a number[] (array) field is rejected at compile time - not a scalar', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.numbers('scores')],
      defaultSort: 'scores',
    });

    expect(() => compileTypesenseCollection({ definition })).toThrow(
      /\[compileTypesenseCollection\]/,
    );
  });

  test('defaultSort on a sortable NUMBER field compiles with both default_sorting_field and sort: true', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.number('rating', { sortable: true })],
      defaultSort: 'rating',
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema).toEqual({
      name: 'products',
      fields: [{ name: 'rating', type: 'float', sort: true }],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Typesense wire field.
      default_sorting_field: 'rating',
    });
  });

  test('does not emit default_sorting_field when defaultSort is absent', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.string('title')],
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema).not.toHaveProperty('default_sorting_field');
  });

  test('merges engineOverrides.typesense top-level keys, spread last over the compiled schema', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.string('title')],
      engineOverrides: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Typesense wire field.
        typesense: { token_separators: ['-'] },
      },
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema).toEqual({
      name: 'products',
      fields: [{ name: 'title', type: 'string' }],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Typesense wire field.
      token_separators: ['-'],
    });
  });

  test('ignores engineOverrides.meilisearch and engineOverrides.opensearch entirely', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.string('title')],
      engineOverrides: {
        meilisearch: { filterableAttributes: ['title'] },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- opensearch wire field.
        opensearch: { settings: { number_of_shards: 3 } },
      },
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema).toEqual({
      name: 'products',
      fields: [{ name: 'title', type: 'string' }],
    });
  });

  test('shallow-merges a per-field override matched by name into the compiled field', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.string('title'), field.number('price')],
      engineOverrides: {
        typesense: {
          fields: [{ name: 'title', locale: 'en', infix: true }],
        },
      },
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema.fields).toEqual([
      { name: 'title', type: 'string', locale: 'en', infix: true },
      { name: 'price', type: 'float' },
    ]);
  });

  test('appends an override field whose name has no compiled counterpart', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.string('title')],
      engineOverrides: {
        typesense: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Typesense wire field.
          fields: [{ name: 'embedding', type: 'float[]', num_dim: 384 }],
        },
      },
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema.fields).toEqual([
      { name: 'title', type: 'string' },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Typesense wire field.
      { name: 'embedding', type: 'float[]', num_dim: 384 },
    ]);
  });

  test('throws via the default branch for an unsupported field type (defensive, unreachable by typing)', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.string('title')],
    });
    // Mutate the non-id field (id is auto-prepended) so it reaches the type mapper.
    // @ts-expect-error - intentionally widen to exercise the defensive default branch
    definition.fields[1].type = 'object';

    expect(() => compileTypesenseCollection({ definition })).toThrow(
      /\[compileTypesenseCollection\]/,
    );
  });
});
