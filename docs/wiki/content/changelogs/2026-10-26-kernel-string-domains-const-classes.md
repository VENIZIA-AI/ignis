---
title: Kernel String Options Are Const Classes
description: "Six string options in the kernel package - compress encoding, JWKS algorithm, authorization domain source, route path scope, id schema type and authorize model format - are const classes with SCHEME_SET and isValid. The values are unchanged."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-10-26

## Kernel string options are const classes

<Badge type="tip" text="Enhancement" />

**In one line.** Six options typed as a union of string literals are now a const class plus a `TConstValue` type, like `RepositoryTypes`. The values are the same, so existing code keeps compiling.

| Option | Const class | Type | Values |
|---|---|---|---|
| `ICompressOptions.encoding` | `CompressEncodings` | `TCompressEncoding` | `gzip`, `deflate` |
| `IJWKSIssuerOptions.algorithm` | `JWKSAlgorithms` | `TJWKSAlgorithm` | `ES256`, `RS256`, `EdDSA` |
| `IAuthorizationDomainSource.from` | `AuthorizationDomainSources` | `TAuthorizationDomainSource` | `param`, `header`, `query`, `context` |
| `registerRoutesFromRegistry({ paths })` | `RoutePathScopes` | `TRoutePathScope` | `static`, `param`, `all` |
| `AbstractEntity.getIdType()` | `IdSchemaTypes` | `TIdSchemaType` | `number`, `string` |
| `getAuthorizeModelPrincipals({ format })`, `getAuthorizeModelSettings({ format })` | `AuthorizeModelFormats` | `TAuthorizeModelFormat` | `array`, `record` |

## What changed

- **Each class has `SCHEME_SET` and `isValid(value)`**, so a value read from config or a request can be checked at runtime.
- **The literal still works.** `{ from: 'header', key: 'x-m', type: 'Merchant' }` and `format: 'array'` compile as before; so does `AuthorizationDomainSources.HEADER`.
- **`TJWKSAlgorithm` and `TIdSchemaType` moved files**, not names: both are exported from the same package entries as before.

## Who is affected

Nobody has to change code. Prefer the class value in new code: `RoutePathScopes.PARAM` over `'param'`.
