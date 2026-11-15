/** `true` when the two types accept and produce each other, `never` otherwise. */
export type TSameShape<TActual, TExpected> = [TActual] extends [TExpected]
  ? [TExpected] extends [TActual]
    ? true
    : never
  : never;
