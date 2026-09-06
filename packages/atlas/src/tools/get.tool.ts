import { AtlasConstants, Corpora } from '@/common';
import type { TCorpus } from '@/common';
import type { IChunk } from '@/corpus';
import { RpcError, RpcErrorCodes } from '@/protocol/common';
import type { IToolHandler } from '@/protocol/common';
import type { ChunkStore } from '@/search/store';
import { z } from 'zod';
import { GetInputSchema, parseInput } from './common';

const DESCRIPTION =
  "Read one chunk's body by the id a search hit returned, or a whole document by the same id " +
  'with its `#anchor` dropped, paging a long body with a cursor.';

// Standard base64 (RFC 4648 section 4): 4-character groups, 0-2 trailing `=` padding characters.
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

// The corpus prefix every citation id starts with, reversed - mirrors chunker.ts's citationPrefixOf.
const CORPUS_BY_PREFIX: Record<string, TCorpus> = {
  wiki: Corpora.WIKI,
  changelog: Corpora.CHANGELOG,
  okf: Corpora.KNOWLEDGE,
};

const CONTINUATION_PART_PATTERN = /-part\d+$/;

interface IGetToolResponse {
  id: string;
  title: string;
  headingPath: string;
  body: string;
  next?: string;
}

/** What `get` reads before paging - one chunk's own body, or a whole document's joined one. */
interface IGetTarget {
  id: string;
  title: string;
  headingPath: string;
  body: string;
}

/**
 * The raw `document` column value a document id (no anchor) names - the changelog corpus drops
 * `.md` from its citation id (`chunker.ts`'s `citationDocumentOf`), so it is added back here.
 */
const documentPathOf = (opts: { id: string }): string | undefined => {
  const separator = opts.id.indexOf(':');
  if (separator === -1) {
    return undefined;
  }

  const corpus = CORPUS_BY_PREFIX[opts.id.slice(0, separator)];
  const path = opts.id.slice(separator + 1);
  if (!corpus || path.length === 0) {
    return undefined;
  }

  return corpus === Corpora.CHANGELOG ? `${path}.md` : path;
};

/**
 * Joins a document's chunks in document order, each preceded by its own heading line - the intro
 * chunk (no heading of its own) and a `-partN` continuation (already under its part's heading) are
 * used as they are, so a heading is never repeated.
 */
const wholeDocumentBodyOf = (opts: { chunks: IChunk[] }): string =>
  opts.chunks
    .map(chunk =>
      chunk.anchor === '' || CONTINUATION_PART_PATTERN.test(chunk.anchor)
        ? chunk.body
        : `${chunk.title}\n\n${chunk.body}`,
    )
    .join('\n\n');

/** `undefined` when `id` does not name a known corpus prefix, or no chunk belongs to that document. */
const wholeDocumentOf = (opts: { store: ChunkStore; id: string }): IGetTarget | undefined => {
  const document = documentPathOf({ id: opts.id });
  if (!document) {
    return undefined;
  }

  const chunks = opts.store.list({ document });
  if (chunks.length === 0) {
    return undefined;
  }

  const title = chunks[0].headingPath.split(' > ')[0];
  return { id: opts.id, title, headingPath: title, body: wholeDocumentBodyOf({ chunks }) };
};

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
    const target: IGetTarget | undefined = input.id.includes('#')
      ? opts.store.get({ id: input.id })
      : wholeDocumentOf({ store: opts.store, id: input.id });

    if (!target) {
      throw new RpcError({
        code: RpcErrorCodes.INVALID_PARAMS,
        message: 'unknown id; ids come from search',
      });
    }

    const maxChars = input.maxChars ?? AtlasConstants.GET_BUDGET_CHARS;
    const codePoints = codePointsOf(target.body);
    const offset = decodeCursor({ cursor: input.cursor, totalCodePoints: codePoints.length });
    const page = codePoints.slice(offset, offset + maxChars);
    const nextOffset = offset + page.length;

    const response: IGetToolResponse = {
      id: target.id,
      title: target.title,
      headingPath: target.headingPath,
      body: page.join(''),
    };

    return nextOffset < codePoints.length
      ? { ...response, next: encodeCursor({ offset: nextOffset }) }
      : response;
  },
});
