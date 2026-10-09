import type { TClass } from './class';
import type { ValueOf } from './utility';

/*
 * `& {}` keeps the same literal set but makes it a regular union. Without it the members of a
 * `static readonly` const class stay widening literals, and a value of these types widens to
 * `string` / `number` in an object literal, a `let`, or a generic inference.
 */
export type TStringConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string> & {};
export type TNumberConstValue<T extends TClass<any>> = Extract<ValueOf<T>, number> & {};
export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number> & {};
