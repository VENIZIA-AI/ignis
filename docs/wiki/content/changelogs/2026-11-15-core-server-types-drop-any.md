---
title: The api-reference, static-asset and casbin types stop using any
description: "securitySchemes takes real OpenAPI security schemes, the static-asset MetaLink repository is described by the four verbs the component calls, and the casbin connector and the bearer service payload read unknown."
packages: ['@venizia/ignis']
migration:
  - id: api-reference-security-schemes
    symbols: [IApiReferenceOptions, TApiReferenceSecurityScheme]
    upgrade:
      before: |
        const schemes: Record<string, Record<string, unknown>> = loadSchemes(); // any object fit
        const options: IApiReferenceOptions = { securitySchemes: schemes };
      after: |
        // a scheme is a real OpenAPI security scheme (apiKey, http, oauth2, openIdConnect) or a reference to one
        const schemes: Record<string, TApiReferenceSecurityScheme> = {
          bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        };
        const options: IApiReferenceOptions = { securitySchemes: schemes };
    downgrade:
      steps:
        - "Type the schemes as Record<string, Record<string, unknown>> again; every scheme that fits the newer type fits it."
  - id: static-asset-meta-link-repository
    symbols: [TMetaLinkConfig, IMetaLinkRepository]
    upgrade:
      before: |
        // repository had to be a DefaultCRUDRepository over a MetaLink-compatible table
        const metaLink: TMetaLinkConfig = { repository: () => new DefaultCRUDRepository(dataSource, { entityClass: MetaLinkEntity }) };
      after: |
        // non-breaking: it takes anything with create, updateBy, updateById and deleteBy on MetaLink rows,
        // so the same repository and a small fake in a test both fit
        const metaLink: TMetaLinkConfig = { repository: () => new DefaultCRUDRepository(dataSource, { entityClass: MetaLinkEntity }) };
    downgrade:
      steps:
        - "Nothing to restore: a repository that fits IMetaLinkRepository and was a DefaultCRUDRepository fits the older type."
  - id: casbin-policy-connector-unknown
    symbols: [TCasbinPolicyConnector]
    upgrade:
      before: |
        // the schema slot was Record<string, any>
        const connector: TCasbinPolicyConnector = drizzle(pool, { schema });
      after: |
        // non-breaking in the shipped adapters: the schema slot is Record<string, unknown>, and a drizzle
        // database over a typed schema still fits
        const connector: TCasbinPolicyConnector = drizzle(pool, { schema });
    downgrade:
      steps:
        - "Type the connector's schema as Record<string, any> again."
  - id: bearer-sign-claims-payload
    symbols: [AbstractBearerTokenService.applySignClaims]
    upgrade:
      before: |
        // a subclass that calls the protected hook with an interface-typed payload, or overrides it typed on an interface
        interface ITokenPayload { sub: string; tenant: string }
        class MyTokenService extends AbstractBearerTokenService {
          issue(signer: SignJWT, payload: ITokenPayload) {
            return this.applySignClaims({ signer, payload }); // TS2322 now: no index signature
          }
        }
      after: |
        // the payload is Record<string, unknown>: spread the interface value, or declare the shape as a type alias
        class MyTokenService extends AbstractBearerTokenService {
          issue(signer: SignJWT, payload: ITokenPayload) {
            return this.applySignClaims({ signer, payload: { ...payload } });
          }
        }
    downgrade:
      steps:
        - "Pass the interface value directly again; the older payload was Record<string, any>."
---

# Changelog - 2026-11-15

## The api-reference, static-asset and casbin types stop using any

<Badge type="warning" text="Breaking Change" />

**In one line.** `securitySchemes` takes real OpenAPI security schemes and a few connector and payload types read `unknown`; one runtime default changes for an options object that sets `openapi` to `undefined`.

## What changed

- **Api reference.** `securitySchemes` is `Record<string, TApiReferenceSecurityScheme>`; the document is served with `openapi: '3.0.0'` when the options leave it unset.
- **Static asset.** `TMetaLinkConfig.repository` is an `IMetaLinkRepository`: the four verbs the component calls. A `DefaultCRUDRepository` still fits.
- **Casbin and bearer service.** `TCasbinPolicyConnector` and the protected `applySignClaims` payload read `unknown`.

## Who is affected

- **Code that types its security schemes as free-form records, or overrides or calls `applySignClaims` with an interface-typed payload.** See the migration above.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
const schemes: Record<string, Record<string, unknown>> = { bearer: { type: 'http', scheme: 'bearer' } };
```

**After:**

```typescript
const schemes: Record<string, TApiReferenceSecurityScheme> = { bearer: { type: 'http', scheme: 'bearer' } };
```
