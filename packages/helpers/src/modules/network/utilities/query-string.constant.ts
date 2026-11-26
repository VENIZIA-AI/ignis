import type { TConstValue } from '@/common/types';

/** What `IQueryStringOptions.nullish` does with a nullish value. */
export class QueryStringNullishModes {
  static readonly EMPTY = 'empty';
  static readonly SKIP = 'skip';
}

/** One of `QueryStringNullishModes`. */
export type TQueryStringNullishMode = TConstValue<typeof QueryStringNullishModes>;

/** What `IQueryStringOptions.nested` does with an object or an array value. */
export class QueryStringNestedModes {
  static readonly DROP = 'drop';
  static readonly JSON = 'json';
}

/** One of `QueryStringNestedModes`. */
export type TQueryStringNestedMode = TConstValue<typeof QueryStringNestedModes>;
