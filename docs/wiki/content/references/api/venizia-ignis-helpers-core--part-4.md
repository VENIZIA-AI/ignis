---
title: "@venizia/ignis-helpers/core (4 of 4)"
description: "Every export of @venizia/ignis-helpers/core, from the built declarations (generated)."
---

# `@venizia/ignis-helpers/core (4 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 4 of 4 of [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core).

## `UrlPolicy`

*class*

Everything about a url that can be decided without touching the network.

```ts
export declare class UrlPolicy {
    /** A dotted-quad that is not routable on the public internet. An unparseable input counts as non-public. */
    private static isNonPublicIPv4;
    /** The four octets of a dotted quad as two IPv6 groups, or `null` when it is not one. */
    private static dottedToGroups;
    /**
     * The eight 16-bit groups of an IPv6 literal, whatever its spelling: `::` compression, leading zeros,
     * upper case and a trailing dotted quad (`::127.0.0.1`) all expand to the same groups. `null` for a
     * string that is not an IPv6 literal.
     */
    private static expandIPv6;
    /** The IPv4 rules applied to the address carried in two IPv6 groups. */
    private static isNonPublicEmbedded;
    /**
     * An address that must never be reached with an untrusted url. Anything unrecognised answers
     * `true`: a guard that fails open on a string it cannot parse is not a guard. Takes an IP literal
     * only, in canonical text (dotted decimal without leading zeros; any IPv6 spelling): a domain name or a non-canonical IPv4
     * such as `0177.0.0.1` answers `true`.
     *
     * An IPv6 literal is expanded to its eight groups before it is classified, so every spelling of an
     * address gets the same answer. An address that carries an IPv4 one is judged by the IPv4 rules: v4-mapped
     * (`::ffff:0:0/96`), v4-compatible (`::a.b.c.d`), NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`); a
     * `64:ff9b::` address reaches 169.254.169.254 through a NAT64 gateway just as the dotted form does.
     * Unspecified, loopback, unique local (`fc00::/7`), link-local (`fe80::/10`), multicast (`ff00::/8`),
     * site-local (`fec0::/10`), documentation (`2001:db8::/32`, `3fff::/20`), the IETF protocol assignments `2001::/23` (Teredo among them), discard (`100::/64`), SRv6 (`5f00::/16`), the rest of `64:ff9b::/32` and the reserved `::/8` are non-public.
     */
    static isNonPublicAddress(opts: {
        address: string;
    }): boolean;
    /** `127.0.0.0/8`, as the URL parser writes an IPv4 host. */
    private static readonly LOOPBACK_IPV4_PATTERN;
    private static readonly LOOPBACK_HOSTS;
    /** The addresses that mean "any local address", not a host: as the URL parser writes them. */
    private static readonly UNSPECIFIED_HOSTS;
    /** Whether the URL parser's hostname is a loopback one: `localhost`, `127.0.0.0/8` or `::1`. */
    static isLoopbackHost(opts: {
        hostname: string;
    }): boolean;
    /** Whether the URL parser's hostname is an IP literal (a dotted quad or a bracketed IPv6), not a name. */
    static isLiteralHost(opts: {
        hostname: string;
    }): boolean;
    /** The IPv4 metadata services: the link-local block (AWS, GCP, Azure, ...) and Alibaba's address. */
    private static isMetadataIPv4;
    /**
     * An address a cloud metadata service answers on: `169.254.0.0/16` (`169.254.169.254` among them), `100.100.100.200`,
     * `fd00:ec2::254`, the IPv6 link-local block `fe80::/10`, and each IPv4 one written inside an IPv6 address
     * (v4-mapped, v4-compatible, NAT64, 6to4). A trusted host name never opens one of these; only a trusted origin whose
     * host IS the literal does. Anything unparseable answers `true`.
     */
    static isMetadataAddress(opts: {
        address: string;
    }): boolean;
    /**
     * Validates the trusted origins and answers them as a set. An entry is valid only when the URL parser writes the same
     * origin back, so a path, a query, credentials, upper case, a trailing slash, a default port, an odd IP spelling
     * (`http://2130706433`, `http://[::ffff:10.0.0.5]`) and a scheme other than http or https are refused, never
     * corrected or ignored. `0.0.0.0` and `[::]` are not hosts and are refused too.
     */
    static resolveTrustedOrigins(opts: {
        scope: string;
        trusted?: unknown;
        /** The config key the list came from, named in a refusal. */
        label?: string;
    }): ReadonlySet<string>;
    /** Whether `entry` is exactly an http or https origin as the URL parser writes it. */
    private static isOriginText;
    /**
     * Reads `policy.hosts`: its trusted origins, validated, and `strict`. A policy still carrying `allowedHosts` is refused:
     * ignoring it would widen "only these hosts" to "any public host".
     */
    private static readHosts;
    /** Whether `origin` (as `new URL(...).origin` writes it) is one the policy trusts. */
    static isTrustedOrigin(opts: {
        origin: string;
        policy?: IUrlSafetyPolicy;
    }): boolean;
    /** A bracketed IPv6 literal arrives as `[::1]`; the brackets are not part of the address. */
    static readHostAddress(opts: {
        hostname: string;
    }): string;
    /**
     * A hostname that RESOLVES to a private address passes here on purpose - `UrlGuard` catches that,
     * and this half runs where `node:dns` does not exist.
     */
    static assertSafeUrl(opts: {
        url: string;
        policy?: IUrlSafetyPolicy;
        /** `false` judges a trusted origin like any other (a guarded fetcher call passes it once a hop of the chain was untrusted). @default true */
        isTrustedAllowed?: boolean;
    }): URL;
    /**
     * True when the url will never be allowed, whatever happens next: a bad scheme, a non-public
     * address, an origin outside a strict trusted list, a malformed url, too many hops, or a body over the cap
     * (`UrlSafetyRefusals.isBodyTooLarge` tells that one apart). Retrying any of those repeats the same
     * rejection - drop the work instead.
     *
     * A timeout, a DNS failure or a 5xx answers `false`: those are worth another attempt.
     */
    static isRefusedError(opts: {
        error: unknown;
    }): boolean;
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/policy.ts`

## `UrlSafetyDefaults`

*class*

The values `IUrlSafetyPolicy` uses for a field the caller leaves unset; each is the safe choice.

```ts
export declare class UrlSafetyDefaults {
    static readonly ALLOWED_SCHEMES: string[];
    static readonly ALLOW_PRIVATE_ADDRESS = false;
    static readonly MAX_REDIRECTS = 3;
    static readonly TIMEOUT_MILLISECONDS = 10000;
    static readonly MAX_BYTES: number;
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/constants.ts`

## `UrlSafetyErrors`

*const*

A url the policy refuses is refused forever - the same url will never be allowed. A caller that
retries on failure has to tell that apart from a host that timed out, or it retries a rejection
and turns the guard into a repeat scanner.

```ts
export declare const UrlSafetyErrors: {
    readonly URL_REFUSED: {
        readonly message: {
            readonly text: "Url refused by the safety policy";
            readonly code: "core.url_safety.url_refused";
        };
        readonly statusCode: 400;
        readonly category: "business";
    };
    /** A body over the cap (`maxBytes`): its own code, so a caller tells it from a refused address without reading the message. */
    readonly BODY_TOO_LARGE: {
        readonly message: {
            readonly text: "Body exceeds the cap";
            readonly code: "core.url_safety.body_too_large";
        };
        readonly statusCode: 413;
        readonly category: "business";
    };
};
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/errors.ts`

## `UrlSchemes`

*class*

The only schemes a guarded fetch will speak. `file:` and `gopher:` are the classic SSRF pivots.

```ts
export declare class UrlSchemes {
    static readonly HTTP = "http:";
    static readonly HTTPS = "https:";
}
```

Source: `packages/helpers/src/modules/network/utilities/url-safety/common/constants.ts`

## `UUID_PATTERN`

*const*

Lowercase, version 1-8, RFC variant. The all-zero nil id and the all-one max id fail it on
purpose: both are placeholders, and a column holding one is holding a bug.

```ts
export declare const UUID_PATTERN: RegExp;
```

Source: `packages/helpers/src/modules/uid/uuid/common/constants.ts`

## `UuidHelper`

*class*

One door for every UUID IGNIS mints: `v7()` for a database key, `v5()` for a deterministic key,
`v4()` for a random public identifier. For a secret (a verification link, an API key, a session id)
use `TokenUidHelper` instead: a UUID v4 carries 122 random bits and a fixed, recognisable shape.

A facade over {@link UuidV4Generator}, {@link UuidV5Generator} and {@link UuidV7Generator} - importing one of those from
`@venizia/ignis-helpers/uuid` leaves the other two out of a browser bundle.

```ts
export declare class UuidHelper extends BaseHelper {
    /**
     * Per module copy, not realm-wide: the facade holds no state - ordering lives in the shared v7
     * sequence - and a realm-wide slot would hand an older version's instance, and its generators,
     * to every newer caller.
     */
    private static instance?;
    /** Random - a public identifier or a token. */
    readonly v4: () => string;
    /** Deterministic - same inputs, same id. Reproducible therefore not secret. */
    readonly v5: (opts: {
        namespace: string;
        name: string;
    }) => string;
    /** Time-ordered - a database key. A burst past about 2048 ids per millisecond leads the wall clock. */
    readonly v7: () => string;
    constructor(opts?: {
        scope?: string;
    });
    static getInstance(): UuidHelper;
    /** Lowercase, version 1-8, RFC variant - the nil and max placeholders are refused. */
    static isValid(value: string): boolean;
    /** Reads the version, and for v7 the creation time; undefined when it is not a UUID. */
    inspect(opts: {
        value: string;
    }): IUuidInspection | undefined;
}
```

Source: `packages/helpers/src/modules/uid/uuid/helper.ts`

## `UuidNamespaces`

*class*

The four namespaces RFC 9562 names. A namespace partitions the deterministic space, so one
`name` under two namespaces answers two ids.

Need your own? Mint it ONCE (`bun -e "console.log(crypto.randomUUID())"`) and pin it as a
constant. Generating one at runtime makes `uuidV5` answer a different id every call, silently.

```ts
export declare class UuidNamespaces {
    /** Fully-qualified domain names. */
    static readonly DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    /** URLs. The usual pick for a business key written as a path, like `orders/4711/refund`. */
    static readonly URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
    /** ISO object identifiers. */
    static readonly OID = "6ba7b812-9dad-11d1-80b4-00c04fd430c8";
    /** X.500 distinguished names. */
    static readonly X500 = "6ba7b814-9dad-11d1-80b4-00c04fd430c8";
}
```

Source: `packages/helpers/src/modules/uid/uuid/common/constants.ts`

## `UuidV4Generator`

*class*

Random UUID v4 generator. Use `generate()` for the shared instance or `create()` for one of your own.

```ts
export declare class UuidV4Generator {
    /**
     * Builds a v4 generator. `crypto.randomUUID` is captured once - whether a realm is a secure context
     * never changes - and called with no argument, since Node validates it and `['a'].map(...)` would
     * throw.
     */
    static create(): () => string;
    private static readonly shared;
    /** Mints a random UUID v4 - a public identifier or a token. Reads no `this`, so `['a'].map(UuidV4Generator.generate)` is safe. */
    static generate(): string;
}
```

Source: `packages/helpers/src/modules/uid/uuid/v4.ts`

## `UuidV5Generator`

*class*

Deterministic UUID v5 generator: the same `namespace` and `name` always give the same id. Use `generate()` for the shared instance or `create()` for one with its own cache.

```ts
export declare class UuidV5Generator {
    /** Builds a v5 generator with its own namespace cache and buffer. */
    static create(): (opts: {
        namespace: string;
        name: string;
    }) => string;
    private static readonly shared;
    /**
     * Mints a deterministic UUID v5 from `namespace` and `name` - an idempotency key.
     *
     * Reproducible therefore NOT secret: never a share link, a reset token or an API key.
     */
    static generate(opts: {
        namespace: string;
        name: string;
    }): string;
}
```

Source: `packages/helpers/src/modules/uid/uuid/v5.ts`

## `UuidV7Generator`

*class*

Time-ordered UUID v7 generator. Use `generate()` for the shared instance or `create()` for one with its own clock state and counter.

```ts
export declare class UuidV7Generator {
    /**
     * Builds a v7 generator with its own clock state and counter. Never `Bun.randomUUIDv7`: it is
     * slower, and it reads `(encoding, timestamp)` from whatever it is called with.
     */
    static create(): () => string;
    /** The realm's one generator: the one in the shared slot when another copy of this module put it there, else a new one that fills the slot. */
    private static resolveShared;
    private static readonly shared;
    /**
     * Mints a time-ordered UUID v7 - the default for a string primary key. Forwards no argument: the
     * shared slot may hold another helpers version's generator.
     */
    static generate(): string;
}
```

Source: `packages/helpers/src/modules/uid/uuid/v7.ts`
