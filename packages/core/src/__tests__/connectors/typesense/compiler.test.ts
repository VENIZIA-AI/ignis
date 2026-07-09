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

    // Computed key (not a declared identifier) - the Typesense wire field is a runtime string here.
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
      ['default_sorting_field']: 'rating',
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
      ['default_sorting_field']: 'rating',
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
    const typesenseOverride: Record<string, unknown> = {};
    typesenseOverride['token_separators'] = ['-'];

    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.string('title')],
      engineOverrides: { typesense: typesenseOverride },
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema).toEqual({
      name: 'products',
      fields: [{ name: 'title', type: 'string' }],
      ['token_separators']: ['-'],
    });
  });

  test('ignores engineOverrides.meilisearch and engineOverrides.opensearch entirely', () => {
    const openSearchSettings: Record<string, unknown> = {};
    openSearchSettings['number_of_shards'] = 3;

    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.string('title')],
      engineOverrides: {
        meilisearch: { filterableAttributes: ['title'] },
        opensearch: { settings: openSearchSettings },
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
          fields: [{ name: 'embedding', type: 'float[]', ['num_dim']: 384 }],
        },
      },
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema.fields).toEqual([
      { name: 'title', type: 'string' },
      { name: 'embedding', type: 'float[]', ['num_dim']: 384 },
    ]);
  });

  test('compiles a client-provided vector field to float[] with num_dim and vec_dist', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.vector('vec', { dimensions: 384, distance: 'cosine' })],
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema.fields).toEqual([
      { name: 'vec', type: 'float[]', ['num_dim']: 384, ['vec_dist']: 'cosine' },
    ]);
  });

  test('defaults vec_dist to cosine when distance is not supplied', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.vector('vec', { dimensions: 128 })],
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema.fields).toEqual([
      { name: 'vec', type: 'float[]', ['num_dim']: 128, ['vec_dist']: 'cosine' },
    ]);
  });

  test('compiles an auto-embed vector field to float[] with embed.from/model_config, no vec_dist', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [
        field.string('title'),
        field.vector('vec', { embed: { from: ['title'], model: { name: 'ts/all-MiniLM-L6-v2' } } }),
      ],
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema.fields).toEqual([
      { name: 'title', type: 'string' },
      {
        name: 'vec',
        type: 'float[]',
        ['embed']: { from: ['title'], ['model_config']: { ['model_name']: 'ts/all-MiniLM-L6-v2' } },
      },
    ]);
  });

  test('maps a remote embed model config to snake_case model_config (apiKey -> api_key)', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [
        field.vector('vec', {
          embed: {
            from: ['title'],
            model: { name: 'google/embedding-gecko-001', apiKey: 'SECRET' },
          },
        }),
      ],
    });

    const schema = compileTypesenseCollection({ definition });

    const vec = schema.fields.find(f => f.name === 'vec') as Record<string, unknown>;
    expect(vec['embed']).toEqual({
      from: ['title'],
      ['model_config']: { ['model_name']: 'google/embedding-gecko-001', ['api_key']: 'SECRET' },
    });
  });

  test('maps an OpenAI-compatible embed config with a custom url (e.g. Gemini via the OpenAI endpoint)', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [
        field.vector('vec', {
          embed: {
            from: ['title'],
            model: {
              url: 'https://generativelanguage.googleapis.com/v1beta/openai',
              name: 'openai/gemini-embedding-001',
              apiKey: 'AIza-test',
            },
          },
        }),
      ],
    });

    const schema = compileTypesenseCollection({ definition });

    const vec = schema.fields.find(f => f.name === 'vec') as Record<string, unknown>;
    expect(vec['embed']).toEqual({
      from: ['title'],
      ['model_config']: {
        url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        ['model_name']: 'openai/gemini-embedding-001',
        ['api_key']: 'AIza-test',
      },
    });
  });

  test('forwards an explicit dimensions alongside embed (e.g. a custom model Typesense cannot introspect)', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [
        field.vector('vec', {
          dimensions: 512,
          embed: { from: ['title'], model: { name: 'custom/model' } },
        }),
      ],
    });

    const schema = compileTypesenseCollection({ definition });

    expect(schema.fields).toEqual([
      {
        name: 'vec',
        type: 'float[]',
        ['num_dim']: 512,
        ['embed']: { from: ['title'], ['model_config']: { ['model_name']: 'custom/model' } },
      },
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
