/**
 * Hands `value` over as the type the caller names, for the one place a fixture meets a signature no
 * fixed type can satisfy (a method generic in its result). `Reflect.get` returns `any` for a key the
 * target type does not list, so no cast is written.
 */
export const untyped = <Result>(value: unknown): Result => {
  const holder: object = { value };

  return Reflect.get(holder, 'value');
};
