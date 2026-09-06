import { AtlasConstants } from '@/common';
import { RpcError, RpcErrorCodes } from '@/protocol/common';
import type { IToolHandler } from '@/protocol/common';
import type { ChunkStore } from '@/search/store';
import { z } from 'zod';
import { GetInputSchema, parseInput } from './common';

const DESCRIPTION =
  "Read one chunk's body by the id a search hit returned, paging a long body with a cursor.";

interface IGetToolResponse {
  id: string;
  title: string;
  headingPath: string;
  body: string;
  next?: string;
}

const encodeCursor = (opts: { offset: number }): string =>
  Buffer.from(String(opts.offset), 'utf8').toString('base64');

/** A cursor that is not a non-negative integer once decoded reads as the start of the body. */
const decodeCursor = (opts: { cursor?: string }): number => {
  if (opts.cursor === undefined) {
    return 0;
  }

  const offset = Number(Buffer.from(opts.cursor, 'base64').toString('utf8'));
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
};

export const buildGetTool = (opts: { store: ChunkStore }): IToolHandler => ({
  definition: {
    name: 'get',
    description: DESCRIPTION,
    inputSchema: z.toJSONSchema(GetInputSchema),
  },
  call: async ({ args }) => {
    const input = parseInput({ schema: GetInputSchema, args });
    const chunk = opts.store.get({ id: input.id });
    if (!chunk) {
      throw new RpcError({
        code: RpcErrorCodes.INVALID_PARAMS,
        message: 'unknown id; ids come from search',
      });
    }

    const maxChars = input.maxChars ?? AtlasConstants.GET_BUDGET_CHARS;
    const offset = decodeCursor({ cursor: input.cursor });
    const body = chunk.body.slice(offset, offset + maxChars);
    const nextOffset = offset + body.length;

    const response: IGetToolResponse = {
      id: chunk.id,
      title: chunk.title,
      headingPath: chunk.headingPath,
      body,
    };

    return nextOffset < chunk.body.length
      ? { ...response, next: encodeCursor({ offset: nextOffset }) }
      : response;
  },
});
