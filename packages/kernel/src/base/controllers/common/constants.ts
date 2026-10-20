import type { TConstValue } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { TResponseHeaders } from './types';

/**
 * Constants with NO zod import, deliberately. The container's controller mixin imports
 * `ControllerTransports` from here, so anything this file pulls in reaches every consumer of
 * `Container` - the request schemas live in `schemas.ts` for exactly that reason.
 */

/** Transport protocol constants for controllers. */
export class ControllerTransports {
  static readonly REST = 'rest';
  static readonly GRPC = 'grpc';
}

export type TControllerTransport = TConstValue<typeof ControllerTransports>;

/** Shape of `data` in a `{ count, data }` response, echoed in the `X-Response-Format` header. */
export class ResponseFormats {
  static readonly OBJECT = 'object';
  static readonly ARRAY = 'array';

  static readonly SCHEME_SET = new Set<string>([this.OBJECT, this.ARRAY]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TResponseFormat = TConstValue<typeof ResponseFormats>;

/** Standard REST API path constants for CRUD controllers. */
export class RestPaths {
  static readonly ROOT = '/';
  static readonly COUNT = '/count';
  static readonly FIND_ONE = '/find-one';
}

export const commonResponseHeaders: TResponseHeaders = {
  [HTTP.Headers.REQUEST_TRACING_ID]: {
    description: 'Echo of the request tracing ID',
    schema: { type: 'string' },
  },
  [HTTP.Headers.RESPONSE_COUNT_DATA]: {
    description: 'Number of records in response',
    schema: { type: 'string', examples: ['1', '10', '100'] },
  },
  [HTTP.Headers.RESPONSE_FORMAT]: {
    description: 'Response format indicator',
    schema: { type: 'string', examples: ['array', 'object'] },
  },
};

export const findResponseHeaders: TResponseHeaders = {
  ...commonResponseHeaders,
  [HTTP.Headers.CONTENT_RANGE]: {
    description: 'Content range for pagination (e.g., "records 0-24/100")',
    schema: { type: 'string', examples: ['records 0-24/100', 'records 25-49/100'] },
  },
};
