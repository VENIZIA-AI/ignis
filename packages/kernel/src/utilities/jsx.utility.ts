import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { ErrorSchema } from '@/base/models/common';

/** Creates HTML content configuration for OpenAPI documentation. */
export const htmlContent = (opts: { description: string; required?: boolean }) => {
  const { description } = opts;

  return {
    description,
    content: {
      'text/html': {
        schema: z.string().openapi({
          description: 'HTML content',
          example: '<!DOCTYPE html><html><head><title>Page</title></head><body>...</body></html>',
        }),
      },
    },
    required: opts?.required ?? false,
  };
};

/** Creates HTML response configuration for OpenAPI documentation. */
export const htmlResponse = (opts: { description: string; required?: boolean }) => {
  return {
    [HTTP.ResultCodes.RS_2.Ok]: htmlContent({
      description: opts.description,
      required: opts.required,
    }),
    ['4xx | 5xx']: {
      description: 'Error Response',
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
    },
  };
};
