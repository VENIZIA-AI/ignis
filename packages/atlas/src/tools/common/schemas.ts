import { Corpora } from '@/common';
import { RpcError, RpcErrorCodes } from '@/protocol/common';
import { z } from 'zod';

export const SearchInputSchema = z.object({
  query: z.string().min(2),
  corpus: z.enum(['all', Corpora.WIKI, Corpora.CHANGELOG, Corpora.KNOWLEDGE]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

export const GetInputSchema = z.object({
  id: z.string().min(1),
  maxChars: z.number().int().min(500).max(50000).optional(),
  cursor: z.string().optional(),
});

const INVALID_TYPE_PREFIX_PATTERN = /^Invalid input: /;

/** `path: reason`, the zod default message stripped of its generic "Invalid input: " prefix. */
const messageOf = (opts: { issue: z.core.$ZodIssue }): string => {
  const path = opts.issue.path.map(segment => String(segment)).join('.');
  const reason = opts.issue.message.replace(INVALID_TYPE_PREFIX_PATTERN, '');
  return path.length > 0 ? `${path}: ${reason}` : reason;
};

/** Parses `args` against `schema`; a failure throws `RpcError -32602` naming the first bad field. */
export const parseInput = <TSchema extends z.ZodType>(opts: {
  schema: TSchema;
  args: unknown;
}): z.infer<TSchema> => {
  const result = opts.schema.safeParse(opts.args);
  if (!result.success) {
    throw new RpcError({
      code: RpcErrorCodes.INVALID_PARAMS,
      message: messageOf({ issue: result.error.issues[0] }),
    });
  }

  return result.data;
};
