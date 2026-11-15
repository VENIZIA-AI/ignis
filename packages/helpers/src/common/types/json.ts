/** A JSON scalar. */
export type TJsonPrimitive = string | number | boolean | null;

/**
 * Any value JSON can hold: a scalar, an array of JSON values, or an object whose values are JSON values. The type of a
 * `jsonb` or JSON column that stores whatever the app puts in it (`jValue` of the data-type enrichers).
 *
 * A value typed as an `interface` is not assignable, because an interface has no index signature: spread it
 * (`{ ...meta }`) or declare its shape as a `type`. A `readonly` array, or a value declared `as const`, is refused too:
 * copy it (`[...list]`).
 */
export type TJsonValue = TJsonPrimitive | TJsonValue[] | { [key: string]: TJsonValue };
