import type { TClass, ValueOf } from '@venizia/ignis-inversion';

// `TConstValue` lives in inversion, the lowest layer. One declaration, re-exported here so every
// `@venizia/ignis-helpers/common` import keeps working.
export type { TConstValue } from '@venizia/ignis-inversion';

/*
 * `& {}` keeps the same literal set but makes it a regular union. Without it the members of a
 * `static readonly` const class stay widening literals, and a value of these types widens to
 * `string` / `number` in an object literal, a `let`, or a generic inference.
 */
/** The string values held by the `static readonly` members of const class `T`, as a plain union. */
export type TStringConstValue<T extends TClass<unknown>> = Extract<ValueOf<T>, string> & {};
/** The number values held by the `static readonly` members of const class `T`, as a plain union. */
export type TNumberConstValue<T extends TClass<unknown>> = Extract<ValueOf<T>, number> & {};
