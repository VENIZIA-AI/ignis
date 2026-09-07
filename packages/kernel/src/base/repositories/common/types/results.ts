import { z } from '@hono/zod-openapi';

/** Zod schema for count operation results. */
export const CountSchema = z.object({ count: z.number().default(0) }).openapi({
  description: 'Total count of items matching the criteria.',
  examples: [{ count: 0 }, { count: 10 }],
});

export type TCount = z.infer<typeof CountSchema>;

/** Data range information for paginated queries. Follows HTTP Content-Range standard. */
export type TDataRange = {
  start: number;
  end: number;
  total: number;
};

/** Content-Range envelope with an inclusive `end` - an empty page collapses `end` onto `start`. */
export const buildDataRange = (opts: {
  skip?: number;
  offset?: number;
  dataLength: number;
  total: number;
}): TDataRange => {
  const { skip, offset, dataLength, total } = opts;
  const start = skip ?? offset ?? 0;
  const end = dataLength > 0 ? start + dataLength - 1 : start;
  return { start, end, total };
};

/** The `shouldQueryRange: true` result envelope. */
export type TDataWithRange<R> = { data: Array<R>; range: TDataRange };
