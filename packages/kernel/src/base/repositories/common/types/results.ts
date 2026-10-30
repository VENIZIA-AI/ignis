/** The count envelope. Spelled out rather than inferred from `CountSchema`, which lives in `result-schemas.ts` - inferring it here would put zod on every path that needs the TYPE. */
export type TCount = { count: number };

/** Data range information for paginated queries. Follows HTTP Content-Range standard. */
export type TDataRange = {
  start: number;
  end: number;
  total: number;
};

/** The `Content-Range` of a page: building the range from a result, and writing it as a header value. */
export class DataRangeUtility {
  /** Content-Range envelope with an inclusive `end` - an empty page collapses `end` onto `start`. */
  static buildDataRange(opts: {
    skip?: number;
    offset?: number;
    dataLength: number;
    total: number;
  }): TDataRange {
    const { skip, offset, dataLength, total } = opts;
    const start = skip ?? offset ?? 0;
    const end = dataLength > 0 ? start + dataLength - 1 : start;
    return { start, end, total };
  }

  /** `Content-Range` of a page: inclusive `end`, and `records * /<total>` (no space) when the page is empty. Exported so a route that writes the header itself uses the one formatter. */
  static toContentRange(opts: { range: TDataRange; count: number }): string {
    const { range, count } = opts;
    const { start, end, total } = range;
    return count > 0 ? `records ${start}-${end}/${total}` : `records */${total}`;
  }
}

/** @deprecated Use DataRangeUtility.buildDataRange({ skip, offset, dataLength, total }). Removed in 0.5. */
export const buildDataRange = (opts: {
  skip?: number;
  offset?: number;
  dataLength: number;
  total: number;
}): TDataRange => {
  return DataRangeUtility.buildDataRange(opts);
};

/** The `shouldQueryRange: true` result envelope; `extra` carries what a list answered beside its rows - see `x-request-extra`. */
export type TDataWithRange<R> = {
  data: Array<R>;
  range: TDataRange;
  extra?: Record<string, unknown>;
};
