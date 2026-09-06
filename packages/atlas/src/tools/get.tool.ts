import { AtlasConstants } from '@/common';
import { RpcError, RpcErrorCodes } from '@/protocol/common';
import type { IToolHandler } from '@/protocol/common';
import type { ChunkStore } from '@/search/store';
import { z } from 'zod';
import { GetInputSchema, parseInput } from './common';

const DESCRIPTION =
  "Read one chunk's body by the id a search hit returned, paging a long body with a cursor.";

// Standard base64 (RFC 4648 section 4): 4-character groups, 0-2 trailing `=` padding characters.
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

interface IGetToolResponse {
  id: string;
  title: string;
  headingPath: string;
  body: string;
  next?: string;
}

/** Unicode code points, not UTF-16 units - keeps a surrogate pair (most emoji) from being split. */
const codePointsOf = (body: string): string[] => Array.from(body);

const encodeCursor = (opts: { offset: number }): string =>
  Buffer.from(String(opts.offset), 'utf8').toString('base64');

const isWellFormedBase64 = (value: string): boolean =>
  value.length > 0 && value.length % 4 === 0 && BASE64_PATTERN.test(value);

const invalidCursor = (): RpcError =>
  new RpcError({ code: RpcErrorCodes.INVALID_PARAMS, message: 'invalid cursor' });

/**
 * `undefined` reads as the start of the body. Any other value must be well-formed base64 decoding
 * to a non-negative integer strictly less than `totalCodePoints` - `Buffer.from(_, 'base64')` never
 * throws on malformed input, so the format is checked before decoding, not after.
 */
const decodeCursor = (opts: { cursor?: string; totalCodePoints: number }): number => {
  if (opts.cursor === undefined) {
    return 0;
  }

  if (!isWellFormedBase64(opts.cursor)) {
    throw invalidCursor();
  }

  const offset = Number(Buffer.from(opts.cursor, 'base64').toString('utf8'));
  if (!Number.isInteger(offset) || offset < 0 || offset >= opts.totalCodePoints) {
    throw invalidCursor();
  }

  return offset;
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
    const codePoints = codePointsOf(chunk.body);
    const offset = decodeCursor({ cursor: input.cursor, totalCodePoints: codePoints.length });
    const page = codePoints.slice(offset, offset + maxChars);
    const nextOffset = offset + page.length;

    const response: IGetToolResponse = {
      id: chunk.id,
      title: chunk.title,
      headingPath: chunk.headingPath,
      body: page.join(''),
    };

    return nextOffset < codePoints.length
      ? { ...response, next: encodeCursor({ offset: nextOffset }) }
      : response;
  },
});
