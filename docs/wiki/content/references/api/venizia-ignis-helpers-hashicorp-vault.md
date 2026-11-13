---
title: "@venizia/ignis-helpers/hashicorp-vault"
description: "Every export of @venizia/ignis-helpers/hashicorp-vault, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/hashicorp-vault`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

4 exports, 4 with TSDoc.

## `HashiCorpVaultHelper`

*class*

Secrets provider backed by HashiCorp Vault via `node-vault`. `configure()` must run before use; it logs in and schedules renewal of the Vault token when the token is renewable.

```ts
export declare class HashiCorpVaultHelper extends AbstractSecretsHelper {
    private static readonly TOKEN_RENEWAL_RETRY_BASE_SECONDS;
    private static readonly TOKEN_RENEWAL_RETRY_CAP_SECONDS;
    private readonly endpoint;
    private readonly auth;
    private client?;
    private tokenTimer?;
    private tokenRenewalRetryCount;
    constructor(opts: IHashiCorpVaultHelperOptions);
    configure(): Promise<void>;
    shutdown(): Promise<void>;
    /** The `client_token` of a login answer: a login that carries none is refused, where an undefined token would fail on the first read. */
    private static readClientToken;
    private requireClient;
    /** Authenticates against Vault and returns the resulting token's TTL/renewability so callers can schedule self-renewal. */
    private login;
    private scheduleTokenRenewal;
    /** Without a reschedule here, a transient re-auth failure lets the token expire silently with no recovery - retry with the same capped exponential backoff as lease renewal. */
    private scheduleTokenRenewalRetry;
    private handleTokenRenewal;
    protected fetchRaw(opts: {
        path: string;
    }): Promise<{
        value: Record<string, string>;
        lease: {
            leaseId: string;
            ttlSeconds: number;
            renewable: boolean;
        };
    } | {
        value: Record<string, string>;
        lease?: undefined;
    }>;
    protected renewRaw(opts: {
        leaseId: string;
        ttlSeconds: number;
    }): Promise<{
        ttlSeconds: number;
    } | null>;
    protected revokeRaw(opts: {
        leaseId: string;
    }): Promise<void>;
}
```

Source: `packages/helpers/src/modules/secrets/hashicorp/hashicorp.helper.ts`

## `IHashiCorpVaultHelperOptions`

*interface*

Options for `HashiCorpVaultHelper`. `auth` is validated on construction; `client` replaces the `node-vault` client the helper would otherwise create.

```ts
export interface IHashiCorpVaultHelperOptions {
    endpoint: string;
    auth: TVaultAuth;
    identifier?: string;
    cacheTtlSeconds?: number;
    renewBeforeRatio?: number;
    clock?: IClock;
    timers?: ITimerAdapter;
    /** Injection seam for tests; production builds the real node-vault client in configure(). */
    client?: TVaultClient;
}

/** What Vault answers is the body node-vault passes on: nothing is assumed of it, each key is read and narrowed where it is used. */
interface TVaultClient {
    token: string;
    read(path: string): Promise<unknown>;
    write(path: string, data: Record<string, unknown>): Promise<unknown>;
    approleLogin(opts: Record<string, unknown>): Promise<unknown>;
    kubernetesLogin?(opts: Record<string, unknown>): Promise<unknown>;
    tokenRenewSelf(): Promise<unknown>;
    tokenLookupSelf(): Promise<unknown>;
}
```

Source: `packages/helpers/src/modules/secrets/hashicorp/hashicorp.helper.ts`

## `TVaultAuth`

*type*

A validated Vault login config, discriminated by `method`.

```ts
export type TVaultAuth = z.infer<typeof vaultAuthSchema>;
```

Source: `packages/helpers/src/modules/secrets/hashicorp/auth.ts`

## `vaultAuthSchema`

*const*

Validates the Vault login config; `method` selects the token, AppRole or Kubernetes shape.

```ts
export declare const vaultAuthSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    method: z.ZodLiteral<"token">;
    token: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    method: z.ZodLiteral<"app-role">;
    roleId: z.ZodString;
    secretId: z.ZodString;
    mountPath: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    method: z.ZodLiteral<"kubernetes">;
    role: z.ZodString;
    jwtPath: z.ZodOptional<z.ZodString>;
    mountPath: z.ZodOptional<z.ZodString>;
}, z.core.$strip>], "method">;
```

Source: `packages/helpers/src/modules/secrets/hashicorp/auth.ts`
