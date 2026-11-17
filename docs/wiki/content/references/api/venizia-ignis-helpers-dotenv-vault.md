---
title: "@venizia/ignis-helpers/dotenv-vault"
description: "Every export of @venizia/ignis-helpers/dotenv-vault, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/dotenv-vault`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

2 exports, 2 with TSDoc.

## `DotenvVaultHelper`

*class*

Secrets provider that decrypts a dotenv vault file with `@dotenvx/dotenvx` and serves its entries. Dynamic leases are not supported: `lease()` throws.

```ts
export declare class DotenvVaultHelper extends AbstractSecretsHelper {
    private readonly path;
    private readonly dotenvKey?;
    private readonly decode?;
    constructor(opts: IDotenvVaultHelperOptions);
    protected fetchRaw(): Promise<{
        value: Record<string, string>;
    }>;
    protected renewRaw(): Promise<null>;
    protected revokeRaw(): Promise<void>;
    lease(_opts: {
        path: string;
        key: string;
    }): Promise<ISecretLease>;
}
```

Source: `packages/helpers/src/modules/secrets/dotenv/dotenv.helper.ts`

## `IDotenvVaultHelperOptions`

*interface*

Options for `DotenvVaultHelper`. `dotenvKey` is the decryption key passed to dotenvx when set.

```ts
export interface IDotenvVaultHelperOptions {
    /** @default '.env.vault' */
    path?: string;
    dotenvKey?: string;
    identifier?: string;
    /**
     * TTL in seconds of the get/getBundle cache.
     *
     * @default 300
     */
    cacheTtlSeconds?: number;
    clock?: IClock;
    timers?: ITimerAdapter;
    /** Injection seam for tests; production decrypts via @dotenvx/dotenvx. */
    decode?: (opts: {
        path: string;
        dotenvKey?: string;
    }) => Record<string, string>;
}
```

Source: `packages/helpers/src/modules/secrets/dotenv/dotenv.helper.ts`
