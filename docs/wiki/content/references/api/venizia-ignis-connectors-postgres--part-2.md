---
title: "@venizia/ignis-connectors/postgres (2 of 2)"
description: "Every export of @venizia/ignis-connectors/postgres, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/postgres (2 of 2)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 2 of [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres).

## `UpdateBuilder`

*class*

Composes nested JSON path updates as chained `jsonb_set` calls.
The neutral base owns the split and the path validation.

```ts
export declare class UpdateBuilder extends RelationalUpdateBuilder {
    private static readonly SOURCE_TABLE;
    private static readonly DOCUMENT_COLUMN;
    private static readonly SOURCE_DOCUMENT;
    constructor();
    /**
     * The path and the value are RAW, not bound: `jsonb_set` takes a `text[]` and a `jsonb`, and a
     * bound parameter arrives as untyped text. Safe only because the base has already run every path
     * component through `JsonPathUtility.validateJsonPathComponents`, whose pattern admits no quote.
     */
    protected composeJsonSet(opts: {
        target: SQL;
        path: string[];
        value: unknown;
    }): SQL;
    private toPathLiteral;
    /** The document at `path`: `{}` when missing, NULL when it is a scalar nothing can be set inside. */
    private toParentNode;
    /** Serializes a JavaScript value to a PostgreSQL JSONB literal. */
    private serializeJsonValue;
}
```

Source: `packages/connectors/src/relational/postgres/repositories/dialect/update.ts`
