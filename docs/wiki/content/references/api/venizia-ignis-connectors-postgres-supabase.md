---
title: "@venizia/ignis-connectors/postgres/supabase"
description: "Every export of @venizia/ignis-connectors/postgres/supabase, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/postgres/supabase`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

14 exports, 14 with TSDoc.

## `anonRole`

*const*

```ts
anonRole: import("../pg-core/roles.js").PgRole
```

## `authenticatedRole`

*const*

```ts
authenticatedRole: import("../pg-core/roles.js").PgRole
```

## `authUid`

*const*

```ts
authUid: import("../sql/sql.js").SQL<unknown>
```

## `authUsers`

*const*

```ts
authUsers: import("../pg-core/index.js").PgTableWithColumns<{ name: "users"; schema: "auth"; columns: { id: import("../pg-core/index.js").PgColumn<{ name: "id"; tableName: "users"; dataType: "string"; columnType: "PgUUID"; data: string; driverParam: string; notNull: true; hasDefault: false; isPrimar
```

## `IPostgresJsOptions`

*interface*

postgres-js client options derived from a pooler mode; `prepare` is the server-side prepared-statements switch.

```ts
export interface IPostgresJsOptions {
    prepare: boolean;
    max?: number;
}
```

Source: `packages/connectors/src/relational/postgres/supabase/pooler.ts`

## `PoolerModes`

*class*

How the app reaches Supabase. Direct and session pooler are 5432; transaction pooler is 6543.

```ts
export declare class PoolerModes {
    static readonly DIRECT = "direct";
    static readonly SESSION = "session";
    static readonly TRANSACTION = "transaction";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TPoolerMode;
}
```

Source: `packages/connectors/src/relational/postgres/supabase/pooler.ts`

## `postgresRole`

*const*

```ts
postgresRole: import("../pg-core/roles.js").PgRole
```

## `realtimeMessages`

*const*

```ts
realtimeMessages: import("../pg-core/index.js").PgTableWithColumns<{ name: "messages"; schema: "realtime"; columns: { id: import("../pg-core/index.js").PgColumn<{ name: "id"; tableName: "messages"; dataType: "bigint"; columnType: "PgBigSerial64"; data: bigint; driverParam: string; notNull: true; has
```

## `realtimeTopic`

*const*

```ts
realtimeTopic: import("../sql/sql.js").SQL<unknown>
```

## `serviceRole`

*const*

```ts
serviceRole: import("../pg-core/roles.js").PgRole
```

## `supabaseAuthAdminRole`

*const*

```ts
supabaseAuthAdminRole: import("../pg-core/roles.js").PgRole
```

## `SupabasePooler`

*class*

Derives postgres-js options for connecting to Supabase through its direct, session or transaction pooler.

```ts
export declare class SupabasePooler {
    /** Supavisor's TRANSACTION mode rebinds the backend connection per transaction, so server-side prepared statements do not survive - `prepare: false` is required there, not a tuning knob. `max` is forwarded only when supplied; postgres-js has its own default. */
    static buildPostgresJsOptions(opts: {
        mode: TPoolerMode;
        max?: number;
    }): IPostgresJsOptions;
}
```

Source: `packages/connectors/src/relational/postgres/supabase/pooler.ts`

## `SupabaseRls`

*class*

Row-level-security helpers for Supabase transactions.

```ts
export declare class SupabaseRls {
    /** Sets the Supabase auth context for THIS transaction so `auth.uid()` resolves in RLS policies. `SET LOCAL` only - plain `SET` would leak the identity to the connection's next borrower under a pooler. `role` defaults to the JWT's own `role` claim, the only default that cannot contradict `request.jwt.claims`. */
    static withAuthContext(opts: {
        transaction: IDatabaseTransaction;
        claims: Record<string, unknown>;
        role?: string;
    }): Promise<void>;
}
```

Source: `packages/connectors/src/relational/postgres/supabase/rls.ts`

## `TPoolerMode`

*type*

One of the {@link PoolerModes} values.

```ts
export type TPoolerMode = TConstValue<typeof PoolerModes>;
```

Source: `packages/connectors/src/relational/postgres/supabase/pooler.ts`
