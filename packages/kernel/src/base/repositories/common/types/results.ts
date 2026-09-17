/** The count envelope. Spelled out rather than inferred from `CountSchema`, which lives in `result-schemas.ts` - inferring it here would put zod on every path that needs the TYPE. */
export type TCount = { count: number };

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
