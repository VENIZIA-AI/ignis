import { HTTP } from '@venizia/ignis-helpers/common';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { TRouteContext } from '@venizia/ignis-kernel';
import type { z } from '@hono/zod-openapi';
import type { Env } from 'hono';
import type { TSearchInput } from '@/search/core/repositories/common';
import type { TSearchHit } from './types';

/** A hit whose document is not typed yet: the transform's output is parsed against `response.document` before it is trusted. */
export type TSearchLooseHit = Omit<TSearchHit<object>, 'document'> & { document: unknown };

/** `response` when it is on, with the document type erased: what the controller runs, whatever the model. */
export interface ISearchLooseResponse<RouteEnv extends Env = Env> {
  document: z.ZodType;
  transform: (opts: {
    hits: Array<TSearchHit<object>>;
    found: number;
    context: TRouteContext<RouteEnv>;
    input: Exclude<TSearchInput, { mode: 'raw' }>;
    injected: object;
  }) => ValueOrPromise<Array<TSearchLooseHit>>;
}

/** Runs the `response` transform of a search controller. */
export class SearchResponseUtility {
  /**
   * The transformed hits, each document parsed against `response.document`. The transform may drop hits. It is the
   * server's code, so a transform that throws, returns no list, or returns a document the schema refuses answers 500.
   */
  static async apply<RouteEnv extends Env = Env>(opts: {
    response: ISearchLooseResponse<RouteEnv>;
    hits: Array<TSearchHit<object>>;
    found: number;
    context: TRouteContext<RouteEnv>;
    input: Exclude<TSearchInput, { mode: 'raw' }>;
    injected: object;
  }): Promise<Array<TSearchLooseHit>> {
    const { response, hits, found, context, input, injected } = opts;
    const statusCode = HTTP.ResultCodes.RS_5.InternalServerError;
    let transformed: Array<TSearchLooseHit>;

    try {
      const result = await response.transform({ hits, found, context, input, injected });
      transformed = result;
    } catch (error) {
      throw getError({
        statusCode,
        message: '[search] the response transform threw',
        cause: error,
      });
    }

    if (!Array.isArray(transformed)) {
      throw getError({
        statusCode,
        message: '[search] the response transform must return a list of hits',
      });
    }

    return transformed.map((hit, index) => {
      const parsed = response.document.safeParse(hit.document);

      if (!parsed.success) {
        throw getError({
          statusCode,
          message: `[search] a transformed document does not match response.document | hit: ${index} | ${parsed.error.message}`,
        });
      }

      return { ...hit, document: parsed.data };
    });
  }
}
