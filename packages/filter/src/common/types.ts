/** The filter shape, free of any runtime import. The zod schemas that validate this shape over HTTP stay in `@venizia/ignis-core` - they parse query strings and pull in the OpenAPI layer, which is a server concern. Do not import a value here; the purity guard fails if this file resolves to anything. */

/** Fields selection - an array of field names to include, or an object keyed by field name (`true` includes, `false` excludes). */
export type TFields<T = any> = Partial<{ [K in keyof T]: boolean }> | Array<keyof T>;

/** Field-level comparison operators, mirrored 1:1 from `QueryOperators` in `common/operators.ts`. */
export type TWhereOperators<V> = {
  eq?: V;
  ne?: V;
  neq?: V;
  gt?: V;
  gte?: V;
  lt?: V;
  lte?: V;
  like?: V;
  nlike?: V;
  ilike?: V;
  nilike?: V;
  is?: V | null;
  isn?: V | null;
  regexp?: V;
  iregexp?: V;
  in?: V[];
  inq?: V[];
  nin?: V[];
  exists?: boolean;
  notExists?: boolean;
  between?: [V, V];
  notBetween?: [V, V];
  contains?: V | V[];
  containedBy?: V | V[];
  overlaps?: V | V[];
  not?: V | TWhereOperators<V>;
};

/** A field's condition - a bare scalar (implicit `eq`), `null` (implicit `is`), or an operator object. */
export type TWhereValue<V> = V | null | TWhereOperators<V>;

/** Query conditions for selecting data, with nested `and` / `or`. */
export type TWhere<T = any> = { [key in keyof T]?: TWhereValue<T[key]> } & {
  and?: TWhere<T>[];
  or?: TWhere<T>[];
};

/** Single relation inclusion configuration. */
export type TInclusion = {
  relation: string;
  scope?: TFilter;
  shouldSkipDefaultFilter?: boolean;
};

/** Maximum number of items to return. Defaults to 10 for top-level list queries. */
export type TLimit = number | undefined;

/** Number of items to offset for pagination. */
export type TOffset = number | undefined;

/** Number of items to skip for pagination. */
export type TSkip = number | undefined;

/** Sorting order for results - regular columns (`fieldName ASC`) and JSON/JSONB paths (`metadata.field DESC`). */
export type TOrderBy = string[] | undefined;

/** Comprehensive filter configuration used across all repository query methods. */
export type TFilter<T = any> = {
  where?: TWhere<T>;
  fields?: TFields;
  include?: TInclusion[];
  order?: string[];
  limit?: number;
  offset?: number;
  skip?: number;
};
