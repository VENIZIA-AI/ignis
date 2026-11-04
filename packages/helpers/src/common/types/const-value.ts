import type { TClass } from './class';
import type { ValueOf } from './utility';

/*
 * `& {}` keeps the same literal set but makes it a regular union. Without it the members of a
 * `static readonly` const class stay widening literals, and a value of these types widens to
 * `string` / `number` in an object literal, a `let`, or a generic inference.
 */
/** The string values held by the `static readonly` members of const class `T`, as a plain union. */
export type TStringConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string> & {};
/** The number values held by the `static readonly` members of const class `T`, as a plain union. */
export type TNumberConstValue<T extends TClass<any>> = Extract<ValueOf<T>, number> & {};
/** The string and number values held by the `static readonly` members of const class `T`, as a plain union. */
export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number> & {};
