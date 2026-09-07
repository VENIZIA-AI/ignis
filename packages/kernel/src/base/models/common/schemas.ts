import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { TIdSchemaType } from './types';

/**
 * Local copy of `@venizia/ignis-helpers`'s error response schema - kept out of that package's
 * `/core` subpath on purpose (it would force `@hono/zod-openapi` on every non-REST consumer of the
 * pure error barrel). The kernel already depends on `@hono/zod-openapi` for its REST controller
 * layer, so the shape is reproduced here rather than reached through the root barrel.
 */
export const ErrorSchema = z
  .object({
    statusCode: z.number().optional(),
    message: z.string(),
    normalized: z
      .object({
        text: z.string(),
        code: z.string(),
        args: z.record(z.string(), z.any()),
      })
      .optional(),
    extra: z.record(z.string(), z.any()).optional(),
    requestId: z.string().optional(),
    details: z.record(z.string(), z.any()).optional(),
  })
  .openapi({
    description: 'Error Schema',
    example: {
      statusCode: 409,
      message: 'A category named %{name} already exists.',
      normalized: {
        text: 'A category named %{name} already exists.',
        code: 'server.commerce.category.create.duplicate_name',
        args: { name: 'Ticket' },
      },
      extra: { categoryId: 42 },
      requestId: 'abc-123-def',
      details: { url: 'http://localhost:3000/categories', path: '/categories' },
    },
  });

export const idParamsSchema = (opts?: { idType: TIdSchemaType }) => {
  const { idType = 'number' } = opts ?? {};

  switch (idType) {
    case 'number': {
      return z.object({
        id: z.number().openapi({
          param: {
            name: 'id',
            in: 'path',
            description: 'The unique id of the resource',
          },
          examples: [1, 2, 3],
        }),
      });
    }
    case 'string': {
      return z.object({
        id: z.string().openapi({
          param: {
            name: 'id',
            in: 'path',
            description: 'The unique id of the resource',
          },
          examples: ['4651e634-a530-4484-9b09-9616a28f35e3', 'some_unique_id'],
        }),
      });
    }
    default: {
      throw getError({
        message: `[idParamsSchema] Invalid input idType | valid: [string | number] | idType: ${idType}`,
      });
    }
  }
};

export const jsonContent = <T extends z.ZodType>(opts: {
  schema: T;
  description: string;
  required?: boolean;
}) => {
  return {
    description: opts.description,
    content: { 'application/json': { schema: opts.schema } },
    required: opts.required,
  };
};

/** OpenAPI Header Object format */
type THeaderObject = {
  description?: string;
  schema: { type: string; examples?: Array<string> };
};

/** Map of header names to Header Objects */
type TResponseHeaders = Record<string, THeaderObject>;

type TJsonResponseOpts<T extends z.ZodType, H extends TResponseHeaders | undefined> = {
  schema: T;
  description?: string;
  required?: boolean;
  headers?: H;
};

export const jsonResponse = <
  ContentSchema extends z.ZodType,
  HeaderSchema extends TResponseHeaders | undefined = undefined,
>(
  opts: TJsonResponseOpts<ContentSchema, HeaderSchema>,
) => {
  const baseResponse = jsonContent({
    required: opts.required,
    description: opts.description ?? 'Success Response',
    schema: opts.schema,
  });

  const successResponse = opts.headers ? { ...baseResponse, headers: opts.headers } : baseResponse;

  return {
    [HTTP.ResultCodes.RS_2.Ok]: successResponse,
    ['4xx | 5xx']: jsonContent({ description: 'Error Response', schema: ErrorSchema }),
  };
};
