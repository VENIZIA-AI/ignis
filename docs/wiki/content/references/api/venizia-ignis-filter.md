---
title: "@venizia/ignis-filter"
description: "Every export of @venizia/ignis-filter, from the built declarations (generated)."
---

# `@venizia/ignis-filter`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

18 exports, 18 with TSDoc.

## `QueryOperators`

*class*

Query operators for building where conditions (comparison, pattern, null, array, logical).

```ts
export declare class QueryOperators {
    static readonly EQ = "eq";
    static readonly NE = "ne";
    static readonly NEQ = "neq";
    static readonly GT = "gt";
    static readonly GTE = "gte";
    static readonly LT = "lt";
    static readonly LTE = "lte";
    static readonly LIKE = "like";
    static readonly NOT_LIKE = "nlike";
    static readonly ILIKE = "ilike";
    static readonly NOT_ILIKE = "nilike";
    static readonly IS = "is";
    static readonly IS_NOT = "isn";
    static readonly REGEXP = "regexp";
    static readonly IREGEXP = "iregexp";
    static readonly IN = "in";
    static readonly INQ = "inq";
    static readonly NIN = "nin";
    static readonly EXISTS = "exists";
    static readonly NOT_EXISTS = "notExists";
    static readonly BETWEEN = "between";
    static readonly NOT_BETWEEN = "notBetween";
    static readonly IN_SQL = "inSql";
    static readonly NOT_IN_SQL = "ninSql";
    static readonly CONTAINS = "contains";
    static readonly CONTAINED_BY = "containedBy";
    static readonly OVERLAPS = "overlaps";
    static readonly NOT = "not";
    static readonly AND = "and";
    static readonly OR = "or";
    static readonly SCHEME_SET: Set<string>;
    static readonly LOGICAL_GROUP_OPERATORS: Set<string>;
    static readonly NUMERIC_COMPARISON_OPERATORS: Set<string>;
    /** Checks if operators contain numeric comparisons (used for JSON path numeric casting). */
    static hasNumericComparison(opts: {
        operators: Record<string, any>;
    }): boolean;
    static isValid(orgType: string): boolean;
}
```

Source: `packages/filter/src/common/operators.ts`

## `Sorts`

*class*

Sort direction constants for order by clauses, and the reader of one order entry.

```ts
export declare class Sorts {
    static readonly DESC = "desc";
    static readonly ASC = "asc";
    static readonly SCHEMA_SET: Set<string>;
    /** Characters `JSON.stringify` leaves raw that still break a log line: DEL, C1 controls, U+2028, U+2029. */
    private static readonly RAW_AFTER_JSON;
    static isValid(value: string): boolean;
    /** The entry quoted for an error message: JSON-escaped, and on one line whatever it holds. */
    private static quoteEntry;
    private static isSeparator;
    private static toSortDirection;
    /**
     * Reads one order entry - `field` or `field direction`, tokens separated by whitespace, direction
     * `ASC` or `DESC` in any case (default `ASC`). Throws a 400 naming the whole entry when the field is
     * missing, the direction is unknown, or the entry has more than two tokens.
     */
    static parseEntry(opts: {
        entry: string;
    }): TParsedOrderEntry;
}
```

Source: `packages/filter/src/common/operators.ts`

## `TByIdFilter`

*type*

The filter of a read by id: no `where` (the id is the `where`), `fields` typed like `TFilter`.

```ts
export type TByIdFilter<T = any, F extends TFields<T> = TFields<T>> = Omit<TFilter<T>, 'where' | 'fields'> & {
    fields?: F;
};
```

Source: `packages/filter/src/common/types.ts`

## `TFields`

*type*

Fields selection - an array of field names to include, or an object keyed by field name; only a `true` entry selects (a `false` is ignored by the query layer). `any` for an untyped model.

```ts
export type TFields<T = any> = 0 extends 1 & T ? any : Partial<{
    [K in keyof T]: boolean;
}> | ReadonlyArray<keyof T>;
```

Source: `packages/filter/src/common/types.ts`

## `TFilter`

*type*

Comprehensive filter configuration used across all repository query methods.

```ts
export type TFilter<T = any, F extends TFields<T> = TFields<T>> = {
    where?: TWhere<T>;
    fields?: F;
    include?: TInclusion[];
    order?: string[];
    limit?: number;
    offset?: number;
    skip?: number;
};
```

Source: `packages/filter/src/common/types.ts`

## `TInclusion`

*type*

Single relation inclusion configuration.

```ts
export type TInclusion = {
    relation: string;
    scope?: TFilter;
    shouldSkipDefaultFilter?: boolean;
};
```

Source: `packages/filter/src/common/types.ts`

## `TIsoTimestamp`

*type*

Branded read-shape for a timestamp column normalized to ISO 8601 (`isoTimestamp` in
`@venizia/ignis-connectors`), whose `toDriver` accepts a `Date` even though the column reads
back as `string`. A plain `text` column stays bare `string` and is untouched by this brand -
only a column built with it is eligible for the `Date` widening below.

```ts
export type TIsoTimestamp = string & {
    readonly isoTimestampBrand: unique symbol;
};
```

Source: `packages/filter/src/common/types.ts`

## `TJsonColumnKey`

*type*

The columns of `T` whose value can hold JSON - the only columns a JSON-path key may start with.

```ts
export type TJsonColumnKey<T> = {
    [K in keyof T & string]: TIsJsonValue<NonNullable<T[K]>> extends true ? K : never;
}[keyof T & string];

/** `true` when a column value can hold JSON: `unknown`, `any` or an object other than a `Date` or a `TIsoTimestamp`. */
type TIsJsonValue<V> = unknown extends V ? true : V extends Date | TIsoTimestamp ? false : V extends object ? true : false;
```

Source: `packages/filter/src/common/types.ts`

## `TJsonPathKey`

*type*

A JSON-path key on a JSON column of `T`: `metadata.a.b` or `metadata[0]`.

```ts
export type TJsonPathKey<T> = `${TJsonColumnKey<T>}.${string}` | `${TJsonColumnKey<T>}[${string}`;
```

Source: `packages/filter/src/common/types.ts`

## `TOrderEntry`

*type*

One typed order entry, opt-in through `satisfies TOrderEntry<T>[]` - `TFilter.order` stays `string[]`.

```ts
export type TOrderEntry<T> = TOrderKey<T> | `${TOrderKey<T>} ${TOrderDirection}`;

/** A column of `T` or a JSON-path key on one of its JSON columns. */
type TOrderKey<T> = (keyof T & string) | TJsonPathKey<T>;

/** An order direction in either case. */
type TOrderDirection = TSortDirection | Uppercase<TSortDirection>;
```

Source: `packages/filter/src/common/types.ts`

## `TParsedOrderEntry`

*type*

One order entry read by `Sorts.parseEntry`: the field as written, the direction lower-cased.

```ts
export type TParsedOrderEntry = {
    field: string;
    direction: TSortDirection;
};
```

Source: `packages/filter/src/common/types.ts`

## `TRow`

*type*

The row of a read: `R` when the caller named it (`find<MyType>`), else the row `fields` leaves. `unknown` is the "not named" marker.

```ts
export type TRow<T, R, F> = unknown extends R ? TSelectedRow<T, F> : R;
```

Source: `packages/filter/src/common/types.ts`

## `TSelectedRow`

*type*

The row `fields` leaves: `Pick` of the selected keys, the whole row when nothing narrows it. A model with no known keys (`any`, `object`) stays `any`: there is nothing to pick from.

```ts
export type TSelectedRow<T, F> = [keyof T] extends [never] ? any : [TSelectedKeys<T, F>] extends [never] ? T : [keyof T] extends [TSelectedKeys<T, F>] ? T : Pick<T, TSelectedKeys<T, F> | TOptionalKeys<T>>;

/**
 * The keys a `fields` selection keeps, which is what the query layer reads: an array names them, an
 * object keeps its `true` entries. An empty selection, an object with no `true`, or a value the type
 * cannot read (`boolean`, a non-literal array) keeps the whole row - the same as the runtime.
 */
type TSelectedKeys<T, F> = F extends ReadonlyArray<infer K> ? K & keyof T : F extends object ? {
    [K in keyof F]: boolean extends F[K] ? 0 : F[K] extends true ? K : never;
}[keyof F] extends infer U ? 0 extends U ? keyof T : U & keyof T : keyof T : keyof T;

/** The keys a model declares optional (`items?: ...`): relations, which an `include` adds beside the selected columns. */
type TOptionalKeys<T> = {
    [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];
```

Source: `packages/filter/src/common/types.ts`

## `TSortDirection`

*type*

A sort direction, exactly the `Sorts` values.

```ts
export type TSortDirection = TConstValue<typeof Sorts>;
```

Source: `packages/filter/src/common/types.ts`

## `TSqlFragment`

*type*

A SQL fragment built in code - a Drizzle `SQL` or `SQLWrapper` - named structurally so this
package stays free of Drizzle. JSON from a request can never satisfy it.

```ts
export type TSqlFragment = {
    getSQL(): unknown;
};
```

Source: `packages/filter/src/common/types.ts`

## `TWhere`

*type*

Query conditions for selecting data - column keys, JSON-path keys on JSON columns, and nested
`and` / `or`. A JSON-path value is `unknown` so a `Record<string, unknown>` still assigns.

```ts
export type TWhere<T = any> = {
    [key in keyof T]?: TWhereValue<T[key]>;
} & {
    [key in TJsonPathKey<T>]?: unknown;
} & {
    and?: TWhere<T>[];
    or?: TWhere<T>[];
};
```

Source: `packages/filter/src/common/types.ts`

## `TWhereOperators`

*type*

Field-level comparison operators, mirrored 1:1 from `QueryOperators` in `common/operators.ts`.

```ts
export type TWhereOperators<V> = {
    eq?: V;
    ne?: V;
    neq?: V;
    gt?: V;
    gte?: V;
    lt?: V;
    lte?: V;
    like?: V;
    nlike?: V;
    ilike?: V;
    nilike?: V;
    is?: V | null;
    isn?: V | null;
    regexp?: V;
    iregexp?: V;
    in?: V[];
    inq?: V[];
    nin?: V[];
    exists?: boolean;
    notExists?: boolean;
    between?: [V, V];
    notBetween?: [V, V];
    inSql?: TSqlFragment;
    ninSql?: TSqlFragment;
    contains?: V | V[];
    containedBy?: V | V[];
    overlaps?: V | V[];
    not?: V | TWhereOperators<V>;
};
```

Source: `packages/filter/src/common/types.ts`

## `TWhereValue`

*type*

A field's condition - a bare scalar (implicit `eq`), `null` (implicit `is`), or an operator
object. A `TIsoTimestamp` column also accepts a `Date`, inside the operator object as well as
bare - the column's own `toDriver` already converts one.

```ts
export type TWhereValue<V> = TWidenIsoTimestamp<V> | null | TWhereOperators<TWidenIsoTimestamp<V>>;

/** Adds `Date` to a branded `TIsoTimestamp` value type; every other type passes through unchanged. */
type TWidenIsoTimestamp<V> = V extends TIsoTimestamp ? V | Date : V;
```

Source: `packages/filter/src/common/types.ts`
