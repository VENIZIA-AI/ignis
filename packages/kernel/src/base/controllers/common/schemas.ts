import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';

/**
 * The zod-backed request schemas, kept apart from `constants.ts` ON PURPOSE. `z.object()` runs at
 * module load, so any bundle reaching this file carries the whole of zod. While these lived beside
 * `ControllerTransports`, which the container's controller mixin imports, importing `Container`
 * alone cost 437 KB - 423 KB of it zod - for a four-line const class.
 */
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
