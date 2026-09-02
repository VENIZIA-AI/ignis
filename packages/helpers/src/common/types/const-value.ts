import type { TClass } from './class';
import type { ValueOf } from './utility';

export type TStringConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string>;
export type TNumberConstValue<T extends TClass<any>> = Extract<ValueOf<T>, number>;
export type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;
