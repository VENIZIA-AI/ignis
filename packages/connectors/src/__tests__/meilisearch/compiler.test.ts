import { describe, expect, test } from 'bun:test';
import { compileMeilisearchCollection } from '@/search/meilisearch/compiler';
import { defineSearchCollection, field } from '@/search/core/models';

describe('compileMeilisearchCollection', () => {
  test('searchable/filterable/sortable flags become index settings', () => {
    const definition = defineSearchCollection({
      name: 'articles',
      fields: [
        field.id(),
        field.string('title', { searchable: true }),
        field.string('body', { searchable: true }),
        field.number('score', { filterable: true, sortable: true }),
      ],
    });

    const plan = compileMeilisearchCollection({ definition });

    expect(plan.uid).toBe('articles');
    expect(plan.primaryKey).toBe('id');
    expect(plan.settings['searchableAttributes']).toEqual(['title', 'body']);
    expect(plan.settings['filterableAttributes']).toEqual(['score']);
    expect(plan.settings['sortableAttributes']).toEqual(['score']);
  });

  test('no searchable field leaves searchableAttributes at the engine default', () => {
    const definition = defineSearchCollection({
      name: 'raw',
      fields: [field.id(), field.string('title')],
    });

    const plan = compileMeilisearchCollection({ definition });

    // An empty array would disable search entirely; `['*']` is Meilisearch's own default.
    expect(plan.settings['searchableAttributes']).toEqual(['*']);
  });

  test('synonyms compile to a flat dictionary; root makes it one-way', () => {
    const definition = defineSearchCollection({
      name: 'products',
      fields: [field.id()],
      synonyms: [
        { id: 'jacket', synonyms: ['jacket', 'coat'] },
        { id: 'laptop', root: 'laptop', synonyms: ['notebook'] },
      ],
    });

    const plan = compileMeilisearchCollection({ definition });

    expect(plan.settings['synonyms']).toEqual({
      jacket: ['coat'],
      coat: ['jacket'],
      laptop: ['notebook'],
    });
  });

  test('a client-provided vector field becomes a userProvided embedder', () => {
    const definition = defineSearchCollection({
      name: 'documents',
      fields: [field.id(), field.vector('embedding', { dimensions: 384 })],
    });

    const plan = compileMeilisearchCollection({ definition });

    expect(plan.settings['embedders']).toEqual({
      embedding: { source: 'userProvided', dimensions: 384 },
    });
  });

  test('an auto-embed vector field becomes a documentTemplate embedder', () => {
    const definition = defineSearchCollection({
      name: 'documents',
      fields: [
        field.id(),
        field.string('title'),
        field.string('body'),
        field.vector('embedding', {
          embed: {
            from: ['title', 'body'],
            model: { name: 'openai/text-embedding-3-small', apiKey: 'k' },
          },
        }),
      ],
    });

    const plan = compileMeilisearchCollection({ definition });

    expect(plan.settings['embedders']).toEqual({
      embedding: {
        source: 'openAi',
        model: 'text-embedding-3-small',
        apiKey: 'k',
        documentTemplate: '{{doc.title}} {{doc.body}}',
      },
    });
  });

  test('an unknown embed provider throws', () => {
    const definition = defineSearchCollection({
      name: 'documents',
      fields: [
        field.id(),
        field.vector('embedding', { embed: { from: ['title'], model: { name: 'ts/all-MiniLM' } } }),
      ],
    });

    expect(() => compileMeilisearchCollection({ definition })).toThrow(/embed provider/);
  });

  test('a geopoint field not named _geo throws', () => {
    const definition = defineSearchCollection({
      name: 'places',
      fields: [field.id(), field.geopoint('location')],
    });

    expect(() => compileMeilisearchCollection({ definition })).toThrow(/_geo/);
  });

  test('a second geopoint field throws', () => {
    const definition = defineSearchCollection({
      name: 'places',
      fields: [field.id(), field.geopoint('_geo'), field.geopoint('other')],
    });

    expect(() => compileMeilisearchCollection({ definition })).toThrow(/exactly one geo field/);
  });

  test('a geopoint named _geo compiles', () => {
    const definition = defineSearchCollection({
      name: 'places',
      fields: [field.id(), field.geopoint('_geo', { filterable: true })],
    });

    expect(() => compileMeilisearchCollection({ definition })).not.toThrow();
  });

  test('a non-cosine vector distance throws', () => {
    const definition = defineSearchCollection({
      name: 'documents',
      fields: [field.id(), field.vector('embedding', { dimensions: 8, distance: 'l2' })],
    });

    expect(() => compileMeilisearchCollection({ definition })).toThrow(/cosine/);
  });

  test('a defaultSort field that is not sortable throws', () => {
    const definition = defineSearchCollection({
      name: 'documents',
      fields: [field.id(), field.number('score')],
      defaultSort: 'score',
    });

    expect(() => compileMeilisearchCollection({ definition })).toThrow(/sortable/);
  });

  test('a sortable defaultSort field compiles', () => {
    const definition = defineSearchCollection({
      name: 'documents',
      fields: [field.id(), field.number('score', { sortable: true })],
      defaultSort: 'score',
    });

    const plan = compileMeilisearchCollection({ definition });
    expect(plan.settings['sortableAttributes']).toEqual(['score']);
  });

  test('engineOverrides.meilisearch merges last onto settings', () => {
    const definition = defineSearchCollection({
      name: 'documents',
      fields: [field.id()],
      engineOverrides: { meilisearch: { rankingRules: ['words', 'typo'] } },
    });

    const plan = compileMeilisearchCollection({ definition });
    expect(plan.settings['rankingRules']).toEqual(['words', 'typo']);
  });
});
