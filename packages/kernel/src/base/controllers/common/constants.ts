import { z } from '@hono/zod-openapi';
import type { TConstValue } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import type { TResponseHeaders } from './types';

/** Transport protocol constants for controllers. */
export class ControllerTransports {
  static readonly REST = 'rest';
  static readonly GRPC = 'grpc';
}

export type TControllerTransport = TConstValue<typeof ControllerTransports>;

/** Standard REST API path constants for CRUD controllers. */
export class RestPaths {
  static readonly ROOT = '/';
  static readonly COUNT = '/count';
  static readonly FIND_ONE = '/find-one';
}

export const trackableHeaders = z.object({
  [HTTP.Headers.REQUEST_TRACING_ID]: z.string().optional().openapi({
    description: 'Optional request ID',
  }),
  [HTTP.Headers.REQUEST_CHANNEL]: z
    .string()
    .optional()
    .openapi({
      description: 'Optional request channel',
      examples: ['channel-1', 'web', 'spos'],
    }),
  [HTTP.Headers.REQUEST_DEVICE_INFO]: z
    .string()
    .optional()
    .openapi({
      description: 'Optional request device info',
      examples: ['dev-1', 'device-abc', 'd-unique-id'],
    }),
});

export const countableHeaders = z.object({
  [HTTP.Headers.REQUEST_COUNT_DATA]: z
    .string()
    .optional()
    .openapi({
      description:
        'Controls response format. When "true" (default): returns {count, data}. When "false": returns data only.',
      examples: ['true', '1', 'false', '0'],
    }),
});

export const defaultRequestHeaders = trackableHeaders.extend(countableHeaders.shape);

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
