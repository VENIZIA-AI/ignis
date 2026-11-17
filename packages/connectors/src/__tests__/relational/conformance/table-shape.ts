/** `true` when the two types accept and produce each other and name the same keys, `never` otherwise: an extra optional key on one side is not the same shape. */
export type TSameShape<TActual, TExpected> = [TActual] extends [TExpected]
  ? [TExpected] extends [TActual]
    ? [keyof TActual] extends [keyof TExpected]
      ? [keyof TExpected] extends [keyof TActual]
        ? true
        : never
      : never
    : never
  : never;
