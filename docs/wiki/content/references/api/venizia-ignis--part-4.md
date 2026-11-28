---
title: "@venizia/ignis (4 of 4)"
description: "Every export of @venizia/ignis, from the built declarations (generated)."
---

# `@venizia/ignis (4 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 4 of 4 of [`@venizia/ignis`](/references/api/venizia-ignis).

## `UserPolicyLineCache`

*class*

Per-user redis cache of casbin policy lines. Owns the cache key, the TTL, and concurrent-miss
de-duplication so N simultaneous misses for the same user collapse onto one extraction.

```ts
export declare class UserPolicyLineCache extends BaseHelper {
    private readonly cached;
    private readonly loadLines;
    private readonly pendingLineFetches;
    constructor(opts: {
        cached: ICasbinEnforcerCachedRedis & {
            use: true;
        };
        loadLines: TPolicyLineLoader;
    });
    /** Fetch the user's lines, collapsing concurrent misses per key onto one extraction. Best-effort: two misses may race past the cache read and both extract (benign - per-user lines are identical). */
    fetch(opts: {
        user: IAuthorizationUser;
    }): Promise<string[]>;
    /** Drop the user's cached entry. */
    invalidate(opts: {
        user: IAuthorizationUser;
    }): Promise<{
        cacheKey: string;
        invalidatedKeys: number;
    }>;
    /** Drop then recompute the user's cached entry via `loadLines` - an isolated extraction (never a pooled serving enforcer), so a concurrent request cannot make the cache hold another user's lines. */
    rebuild(opts: {
        user: IAuthorizationUser;
    }): Promise<{
        cacheKey: string;
        lines: string[];
    }>;
    /** Compute the user's cache key and reject an empty result - consistent with the read path. */
    private resolveCacheKey;
    /** Single source of truth for the cache encoding. Used by the miss path and rebuild(). */
    private writeLines;
    /** Decode cached policy lines; on any corruption, log and return null so the caller refetches. */
    private parseLines;
}
```

Source: `packages/core-server/src/components/auth/authorize/enforcers/user-policy-line-cache.ts`
