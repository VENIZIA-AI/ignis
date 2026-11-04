/** Numeric entity id. */
export type NumberIdType = number;
/** String entity id. */
export type StringIdType = string;
/** Bigint entity id. */
export type BigIntIdType = bigint;
/** Any id type an entity can use: number, string or bigint. */
export type IdType = NumberIdType | StringIdType | BigIntIdType;

declare const entityIdBrand: unique symbol;

/**
 * A string id a plain `string` cannot be assigned to, so passing a name, code or email where an id
 * belongs is a compile error. Opt a column in with `.$type<TEntityId>()`.
 *
 * IT VALIDATES NOTHING. `toEntityId` is a cast with a non-empty check; the value is making the
 * laundering VISIBLE at each boundary, not proving the string is a real id.
 *
 * The cost is not optional: Drizzle derives `$inferInsert` and `$inferSelect` from the same field,
 * so a branded column rejects every literal - `create({ data: { merchantId: 'M1' } })`, seeds,
 * fixtures, path params - until each converts. A union with `string` would restore those but makes
 * a plain `string` assignable again, which erases the whole guarantee. Measured, not assumed.
 */
export type TEntityId = string & { readonly [entityIdBrand]: never };
