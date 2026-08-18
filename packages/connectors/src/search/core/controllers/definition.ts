import { jsonContent, jsonResponse } from '@venizia/ignis-kernel';
import type { TAuthMode, TAuthStrategy } from '@venizia/ignis-kernel';
import type { IAuthorizationSpec } from '@venizia/ignis-kernel';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { MultiSearchInputSchema, SearchInputSchema } from '@/search/core/repositories/common';

export const defineSearchRouteConfigs = (opts: {
  selectSchema: z.ZodTypeAny;
  authenticate?: { strategies?: TAuthStrategy[]; mode?: TAuthMode };
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}) => {
  const { selectSchema, authenticate, authorize } = opts;

  const searchResponseSchema = z.object({
    found: z.number(),
    isFoundExact: z
      .boolean()
      .openapi({ description: 'False when the engine reports `found` as an estimate.' }),
    hits: z.array(z.object({ document: selectSchema })),
  });

  const multiSearchResponseSchema = z.record(z.string(), z.unknown());

  const resolvedAuthenticate = authenticate ?? {};

  return {
    SEARCH: {
      method: HTTP.Methods.POST,
      path: '/search',
      description: 'Single-collection search (keyword, semantic, hybrid, or raw passthrough)',
      authenticate: resolvedAuthenticate,
      authorize,
      request: {
        body: jsonContent({
          description: 'Search input, discriminated by mode',
          schema: SearchInputSchema,
        }),
      },
      responses: jsonResponse({
        description: 'Search results',
        schema: searchResponseSchema,
      }),
    },

    MULTI_SEARCH: {
      method: HTTP.Methods.POST,
      path: '/multi-search',
      description: 'Cross-collection search, forwarded verbatim to the search engine',
      authenticate: resolvedAuthenticate,
      authorize,
      request: {
        body: jsonContent({
          description: 'Multi-search input - one or more per-collection native search params',
          schema: MultiSearchInputSchema,
        }),
      },
      responses: jsonResponse({
        description: 'Federated (or, when union is true, merged) search results',
        schema: multiSearchResponseSchema,
      }),
    },
  } as const;
};
