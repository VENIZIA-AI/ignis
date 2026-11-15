// Must precede the controllers/factory import below: avoids a circular-import TDZ error.
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';
import { z } from '@hono/zod-openapi';
import { repository } from '@venizia/ignis-kernel';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { DefaultSearchRepository } from '@/search/core/repositories';
import type { TRepositoryTuning } from '@/search/core/controllers';
import type { TypesenseDataSource } from '@/search/typesense/datasources';
import { MeilisearchDataSource } from '@/search/meilisearch/datasources';
import { BaseSearchEntity, SearchCollectionFactory, field } from '@/search/core/models';
import { model } from '@venizia/ignis-kernel';
import { FakeSearchDataSource } from '../repositories/fake-search-connector';

/** The types of `query` and `response`, checked by `tsc` (`bun check` is more lenient): every `@ts-expect-error` below must fail to compile. */

// A model that names its schema, so the document type carries its field names.
@model({
  type: 'entity',
  tableName: 'query_type_products',
  settings: { properties: { hidden: ['secret'] } },
})
class QueryTypeProduct extends BaseSearchEntity<typeof QueryTypeProduct.schema> {
  static override schema = SearchCollectionFactory.define({
    name: 'query_type_products',
    fields: [
      field.string('title', { searchable: true }),
      field.string('name'),
      field.string('secret'),
      field.number('price'),
    ],
  });
}

type TProductDocument = NonNullable<QueryTypeProduct['$inferData']>;

class TypesenseTypedDataSource extends FakeSearchDataSource {}

@repository({ model: QueryTypeProduct, dataSource: TypesenseTypedDataSource })
class TypedProductRepository extends DefaultSearchRepository<
  TProductDocument,
  TypesenseDataSource
> {}

@repository({ model: QueryTypeProduct, dataSource: TypesenseTypedDataSource })
class UntypedProductRepository extends DefaultSearchRepository<TProductDocument> {}

@repository({ model: QueryTypeProduct, dataSource: MeilisearchDataSource })
class MeilisearchRepository extends DefaultSearchRepository<
  TProductDocument,
  MeilisearchDataSource
> {}

/** Compiles, never runs: the call is there for `tsc`, and a bad one throws at runtime too. */
const typeOnly = (_check: () => unknown) => {};

describe('query types', () => {
  test('the tuning type follows the datasource of the repository', () => {
    const typesense: TRepositoryTuning<typeof TypedProductRepository> = { numTypos: 1 };
    const none: TRepositoryTuning<typeof UntypedProductRepository> extends never ? true : false =
      true;

    // A datasource that binds no tuning, and a Meilisearch one, leave `tuning` closed.
    const meili: [TRepositoryTuning<typeof MeilisearchRepository>] extends [never] ? true : false =
      true;

    expect(typesense.numTypos).toBe(1);
    expect(none).toBe(true);
    expect(meili).toBe(true);
  });

  test('settings are typed against the model and the engine', () => {
    SearchControllerFactory.build({
      repository: TypedProductRepository,
      authenticate: { skip: true },
      routes: { search: { use: true } },
      query: {
        fixed: {
          queryBy: ['title', 'name'],
          queryByWeights: { title: 3, name: 1 },
          order: ['title DESC'],
        },
        default: ({ input }) => ({
          tuning: {
            numTypos: 'query' in input && input.query === '1' ? 0 : { title: 1, name: 0 },
            infix: { title: 'off' as const, name: 'fallback' as const },
            prioritizeExactMatch: true,
          },
        }),
        allow: { tuning: ['typoTokensThreshold'] },
      },
    });

    typeOnly(() =>
      SearchControllerFactory.build({
        repository: TypedProductRepository,
        authenticate: { skip: true },
        routes: { search: { use: true } },
        // @ts-expect-error sortBy chooses the order, so no client may send it
        query: { allow: { tuning: ['sortBy'] } },
      }),
    );

    typeOnly(() =>
      SearchControllerFactory.build({
        repository: TypedProductRepository,
        authenticate: { skip: true },
        routes: { search: { use: true } },
        // @ts-expect-error a field the model does not have
        query: { fixed: { queryBy: ['nothing'] } },
      }),
    );

    typeOnly(() =>
      SearchControllerFactory.build({
        repository: TypedProductRepository,
        authenticate: { skip: true },
        routes: { search: { use: true } },
        // @ts-expect-error a tuning name Typesense does not have
        query: { default: { tuning: { matchingStrategy: 'all' } } },
      }),
    );

    typeOnly(() =>
      SearchControllerFactory.build({
        repository: TypedProductRepository,
        authenticate: { skip: true },
        routes: { search: { use: true } },
        // @ts-expect-error a keyed knob names fields of the model
        query: { default: { tuning: { numTypos: { nothing: 1 } } } },
      }),
    );

    typeOnly(() =>
      SearchControllerFactory.build({
        repository: UntypedProductRepository,
        authenticate: { skip: true },
        routes: { search: { use: true } },
        // @ts-expect-error a datasource that binds no tuning has none to set
        query: { default: { tuning: { numTypos: 1 } } },
      }),
    );

    typeOnly(() =>
      SearchControllerFactory.build({
        repository: MeilisearchRepository,
        authenticate: { skip: true },
        routes: { search: { use: true } },
        // @ts-expect-error a Typesense knob against a Meilisearch repository
        query: { default: { tuning: { numTypos: 1 } } },
      }),
    );

    expect(true).toBe(true);
  });

  test('authenticate is required and the toggles take { use }', () => {
    expect(() =>
      // @ts-expect-error authenticate is required: a route is open only by { skip: true }
      SearchControllerFactory.build({
        repository: TypedProductRepository,
        routes: { search: { use: true } },
      }),
    ).toThrow(/authenticate is required/);

    typeOnly(() =>
      SearchControllerFactory.build({
        repository: TypedProductRepository,
        authenticate: { skip: true },
        // @ts-expect-error a route toggle is { use }, not a bare true
        routes: { search: true },
      }),
    );

    expect(true).toBe(true);
  });

  test('the response document type is inferred from the schema', () => {
    const PublicProduct = z.object({ id: z.string(), title: z.string() });

    SearchControllerFactory.build({
      repository: TypedProductRepository,
      authenticate: { skip: true },
      routes: { search: { use: true } },
      response: {
        use: true,
        document: PublicProduct,
        transform: ({ hits }) =>
          hits.map((hit) => ({
            ...hit,
            document: { id: String(hit.document.title), title: hit.document.title },
          })),
      },
    });

    typeOnly(() =>
      SearchControllerFactory.build({
        repository: TypedProductRepository,
        authenticate: { skip: true },
        routes: { search: { use: true } },
        response: {
          use: true,
          document: PublicProduct,
          // @ts-expect-error the transform's documents must match `document`
          transform: ({ hits }) => hits.map((hit) => ({ ...hit, document: { id: 1 } })),
        },
      }),
    );

    expect(true).toBe(true);
  });
});
