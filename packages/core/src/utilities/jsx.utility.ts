import { z } from '@hono/zod-openapi';
import { ErrorSchema, HTTP } from '@venizia/ignis-helpers';

/**
 * Create HTML content configuration for OpenAPI documentation
 * Similar to jsonContent() but for HTML responses
 * Scope: [JSXUtility][htmlContent]
 *
 * @param opts - Content options
 * @returns Content configuration object
 */
export const htmlContent = (opts: { description: string; required?: boolean }) => {
  const { description, required = false } = opts;

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
    required,
  };
};

/**
 * Create HTML response configuration for OpenAPI documentation
 * Similar to jsonResponse() but for HTML endpoints
 * Scope: [JSXUtility][htmlResponse]
 *
 * @param opts - Response options
 * @returns Response configuration object with success and error schemas
 */
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
