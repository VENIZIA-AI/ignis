import { HTTP } from '@/common/constants';
import { ErrorSchema } from '@/helpers/error';
import { z } from '@hono/zod-openapi';

// -------------------------------------------------------------------------
export const jsonContent = <T extends z.ZodObject>(opts: {
  schema: T;
  description: string;
  required?: boolean;
}) => {
  const { schema, description, required = false } = opts;
  return {
    description,
    content: { 'application/json': { schema } },
    required,
  };
};

export const jsonResponse = <T extends z.ZodObject>(opts: {
  schema?: T;
  description: string;
  required?: boolean;
}) => {
  return {
    [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
      required: opts.required,
      description: opts.description,
      schema: opts.schema ?? AnyObjectSchema,
    }),
    ['4xx | 5xx']: jsonContent({ description: 'Error Response', schema: ErrorSchema }),
  };
};

// -------------------------------------------------------------------------
export const requiredString = (opts?: { min?: number; max?: number; fixed?: number }) => {
  const { min, max, fixed } = opts ?? {};
  let rs = z.string().nonempty();

  if (min) {
    rs = rs.min(min);
  }

  if (max) {
    rs = rs.max(max);
  }

  if (fixed) {
    rs = rs.length(fixed);
  }

  return rs;
};

// -------------------------------------------------------------------------
export const AnyObjectSchema = z.object().catchall(z.any()).openapi({
  description: 'No schema',
});

export const IdParamsSchema = z.object({
  id: z.coerce.number().openapi({
    param: { name: 'id', in: 'path', required: true },
    required: ['id'],
    example: 42,
  }),
});

export const UUIDParamsSchema = z.object({
  uuid: z.uuid().openapi({
    param: { name: 'id', in: 'path', required: true },
    required: ['id'],
    example: '4651e634-a530-4484-9b09-9616a28f35e3',
  }),
});
