import { ArticleRepository } from '@/repositories';
import {
  BaseRestController,
  BindingKeys,
  BindingNamespaces,
  controller,
  inject,
  jsonResponse,
  TRouteContext,
  TWhere,
  ValueOrPromise,
} from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { z } from '@hono/zod-openapi';

const BASE_PATH = '/search';

const SearchQuerySchema = z.object({
  q: z
    .string()
    .min(1)
    .openapi({ description: 'Full-text query string, or "*" to match every document' }),
  category: z
    .string()
    .optional()
    .openapi({ description: 'Exact-match filter on the category facet' }),
  status: z
    .string()
    .optional()
    .openapi({
      description:
        'Exact-match filter on the status facet. Unlike ArticleRepository.find(), search() is a ' +
        'raw driver passthrough with no dialect translation - the @model defaultFilter ' +
        '(status: published) is NOT auto-applied here, so omitting this returns every status',
    }),
  minViews: z.coerce.number().int().nonnegative().optional(),
  maxViews: z.coerce.number().int().nonnegative().optional(),
  facetBy: z
    .string()
    .optional()
    .openapi({ description: 'Raw Typesense facet_by, e.g. "category,status"' }),
  sortBy: z
    .string()
    .optional()
    .openapi({ description: 'Raw Typesense sort_by, e.g. "views:desc"' }),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
});

const SearchResponseSchema = z.object({
  found: z.number(),
  hits: z.array(z.object({ document: z.record(z.string(), z.unknown()) })),
});

const SEARCHABLE_FIELDS = 'title,content';

/**
 * SearchController - the full-text search verb the CRUD factory cannot generate: faceted,
 * ranked, typo-tolerant querying over ArticleRepository.search(), a raw passthrough to the
 * Typesense driver (no TFilter/where translation, no @model defaultFilter/hiddenProperties).
 */
@controller({ path: BASE_PATH })
export class SearchController extends BaseRestController {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ArticleRepository.name,
      }),
    })
    private readonly repository: ArticleRepository,
  ) {
    super({ scope: SearchController.name, path: BASE_PATH });
  }

  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: {
        path: '/',
        method: 'get',
        request: { query: SearchQuerySchema },
        responses: jsonResponse({
          description: 'Faceted full-text search over articles',
          schema: SearchResponseSchema,
        }),
      },
      handler: context => this.search({ context }),
    });
  }

  private async search(opts: { context: TRouteContext }) {
    const { context } = opts;
    const { q, category, status, minViews, maxViews, facetBy, sortBy, page, perPage } =
      context.req.valid<z.infer<typeof SearchQuerySchema>>('query');

    // Filters go through the query dialect (never hand-concatenated) - it escapes values,
    // so a malicious `category` cannot break out of its filter_by clause.
    const where: TWhere = {};
    if (category) {
      where.category = category;
    }
    if (status) {
      where.status = status;
    }
    if (minViews !== undefined) {
      where.views = { gte: minViews };
    }
    if (maxViews !== undefined) {
      where.views = { ...(where.views as object), lte: maxViews };
    }

    // Wire-format keys mirror Typesense's own search-param field names verbatim (snake_case).
    /* eslint-disable @typescript-eslint/naming-convention */
    const params: Record<string, unknown> = { q, query_by: SEARCHABLE_FIELDS };
    if (Object.keys(where).length > 0) {
      params.filter_by = this.repository.dataSource.getQueryDialect().translateWhere({ where });
    }

    if (facetBy) {
      params.facet_by = facetBy;
    }

    if (sortBy) {
      params.sort_by = sortBy;
    }

    if (page !== undefined) {
      params.page = page;
    }

    if (perPage !== undefined) {
      params.per_page = perPage;
    }
    /* eslint-enable @typescript-eslint/naming-convention */

    // search() is a raw driver passthrough typed `Promise<unknown>` (no dialect translation to
    // narrow it) - the cast is the caller's responsibility, same as any other raw-passthrough API.
    const result = await this.repository.search({ params });

    return context.json({ found: result.found, hits: result.hits ?? [] }, HTTP.ResultCodes.RS_2.Ok);
  }
}
