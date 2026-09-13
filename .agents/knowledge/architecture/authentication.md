---
type: Architecture
title: Authentication
description: How the AuthenticateComponent wires its jwt, basic and service branches, how strategies are registered and resolved, and what a request actually goes through to become an authenticated caller.
resource: packages/kernel/src/base/auth/authenticate
tags: [architecture, authentication, jwt, jwks, basic, service-assertion, components]
---

Authentication in IGNIS is a component plus a strategy registry plus a Hono middleware. The three are deliberately separate: the component configures **token services**, the app registers **strategies**, and the middleware runs them per route.

## Where the code lives

The tree is split across two packages. The seam lives in `@venizia/ignis-kernel` at `packages/kernel/src/base/auth/authenticate`: all of `common` (`Authentication`, `AuthenticationModes`, `JOSEStandards`, `JWKSModes`, `AuthenticateBindingKeys`, `IAuthenticationStrategy`, `IAuthUser`, `AuthenticationErrors`, `AuthenticationFieldCodecs`, `ServiceAssertion`), `AuthenticationProvider`, the `authenticate()` middleware, and `AuthenticationStrategyRegistry` over `AbstractAuthRegistry` (`packages/kernel/src/base/auth/base`). The Hono context variable declarations and the sign-in / sign-up / change-password request schemas moved with it.

The concrete half stays in core at `packages/core-server/src/components/auth/authenticate`: `AuthenticateComponent`, the token services (`BasicTokenService`, `JWSTokenService`, `JWKSIssuerTokenService`, `JWKSVerifierTokenService`), the service assertion pair under `services/service` (`ServiceAssertionSignerService`, `ServiceAssertionVerifierService`), the shipped strategies and the generated controllers. Core's barrels re-export the kernel barrel, so `@/components/auth` and the `@venizia/ignis` root entrypoint still resolve every moved symbol. Unqualified paths below are core-relative.

### Leaf imports, never barrels

Inside `base/auth`, the providers and registries reach each other by **leaf import**: `AuthenticationProvider` imports `../strategies/strategy-registry`, `AuthorizationProvider` imports `../enforcers/enforcer-registry`, and `IAuthUser` comes from `authenticate/common/types` rather than the `authenticate` barrel. `BaseRestController` value-imports the authenticate and authorize middleware leaves, and the `authenticate` barrel pulls those middlewares in (and, through core's re-export, the auth controllers whose factory extends `BaseRestController`) - so a barrel import from inside auth closes a `base/controllers` <-> `auth` module initialization cycle. `packages/core-server/src/__tests__/auth/registry-leaf-imports.test.ts` reads across the package boundary to enforce this; do not tidy the imports back onto the barrels.

## AuthenticateComponent

`AuthenticateComponent` reads its configuration from bindings, not constructor arguments: `AuthenticateBindingKeys.JWT_OPTIONS`, `BASIC_OPTIONS`, `SERVICE_OPTIONS`, `REST_OPTIONS`. There are three independent branches - jwt, basic, service - and `binding()` throws only when all three are absent. Service options alone are a valid application: one that verifies incoming service calls and consumes no user token at all.

The JWT branch is discriminated by `JOSEStandards`:

- **JWS** - a shared-secret token. `defineJWSAuth()` refuses a missing or default `jwtSecret`, requires `getTokenExpiresFn`, and registers `JWSTokenService`.
- **JWKS** - asymmetric, discriminated again by `JWKSModes`:
  - `issuer` - requires `keys.private` / `keys.public`, a valid `keys.format` (`pem` or `jwk`), a `kid`, and `getTokenExpiresFn`. Registers `JWKSIssuerTokenService` and mounts `JWKSController`. The controller's path depends on a runtime option, so `@controller` cannot be applied statically - the component calls `Reflect.decorate([controller({ path: issuerOpts?.rest?.path ?? '/certs' })], JWKSController)` instead.
  - `verifier` - requires `jwksUrl`, registers `JWKSVerifierTokenService` (with `cacheTtlMs` defaulting to 12h and a 30s `cooldownMs`).

`defineBasicAuth()` requires a `verifyCredentials` function and registers `BasicTokenService`. `defineControllers()` optionally mounts a generated auth controller (sign-in / sign-up / change-password / refresh-token / get-user-information) when `restOptions.useAuthController` is true - it is `false` by default and requires `jwtOptions`. `defineOAuth2()` exists but is a TODO stub in source.

### Service-to-service assertions

The third branch authenticates the **calling service**, never a user. `defineServiceAuth()` requires two things:

- `name` - the issuer this service stamps and the audience it demands.
- `resolvePrincipal` - the framework proves *which service* called; the application decides who that caller acts as. A principal without `userId` is refused at the strategy rather than trusted, because `any` mode sets the current user unconditionally. The resolved user carries `callerService`, so which service called stays audit-relevant even when one principal is shared across callers.

It always binds `ServiceAssertionVerifierService`. `ServiceAssertionSignerService` and the certs route (`ServiceCertsController`, default path `ServiceAssertion.DEFAULT_REST_PATH`) are bound **only when `keys` are configured** - most services are called and never call, and publishing a key set for a service that signs nothing advertises a capability it does not have.

The wire contract is fixed in `ServiceAssertion`, not configurable, because both ends must agree: an Ed25519 JWS in its own `x-service-assertion` header (the end user's token keeps `Authorization` on the same request), `typ` `svc+jwt` so a user token cannot be replayed as an assertion, covering only the HTTP method and the percent-encoded pathname - not the query string, headers or body. The `callers` map is caller name to JWKS url **and** the allowlist: a name absent from it cannot call, and an empty map correctly allows nobody.

## Strategies are registered by the app, not the component

The component registers *services*. It does **not** register strategies - with one exception: `defineServiceAuth()` registers `ServiceAuthenticationStrategy` itself, because the caller identity it proves is the component's own branch and nothing about it is the application's to name. Everything else the application registers explicitly:

```typescript
AuthenticationStrategyRegistry.getInstance().register({
  container: this,
  strategies: [
    { strategy: JWSAuthenticationStrategy, name: Authentication.STRATEGY_JWT },
    { strategy: BasicAuthenticationStrategy, name: Authentication.STRATEGY_BASIC },
  ],
});
```

`AuthenticationStrategyRegistry` is a process singleton over `AbstractAuthRegistry<IAuthenticationStrategy>`. `registerDescriptor()` records the descriptor and binds the class into the container under `authentication.strategy.<name>` with `BindingScopes.SINGLETON`; `resolveStrategy({ name })` resolves it back through that container. So a strategy is a fully DI-managed class - `JWSAuthenticationStrategy` and `BasicAuthenticationStrategy` each `@inject` their token service by binding key.

The strategy contract is one method:

```typescript
interface IAuthenticationStrategy<E extends Env = Env> {
  name: string;
  authenticate(context: TContext<E, string>): Promise<IAuthUser>;
}
```

The shipped strategies are five: `BasicAuthenticationStrategy` (name `basic`), `JWSAuthenticationStrategy` (name `jwt`, standard JWS), two JWKS strategies - `JWKSIssuerAuthenticationStrategy` and `JWKSVerifierAuthenticationStrategy` (both name `jwt`, standard JWKS) - and `ServiceAuthenticationStrategy` (name `service`). Each just extracts credentials via its service and verifies them.

## What a request goes through

`authenticate({ strategies, mode })` is a thin wrapper over a module-level `AuthenticationProvider`, which builds a Hono middleware. Per request:

1. If `context.get('authentication.skip')` is set, skip and `next()`.
2. If `context.get('auth.current.user')` is already set, the request is authenticated - `next()`.
3. Dispatch on `mode` (`AuthenticationModes`, default `any`):
   - **`any`** - try each named strategy in order; the first success wins and the loop breaks. A strategy that throws is logged at debug and the next is tried. If no strategy produced a user, throw `401 Unauthorized` naming the tried strategies.
   - **`all`** - every strategy must succeed; the **first** one's user is the identity source. A resulting user without `userId` is a `401`.
4. On success, set `auth.current.user` and (when `userId` exists) `audit.user.id`.

`audit.user.id` is what the model audit enrichers read, which is why authentication and `createdBy`/`updatedBy` columns are coupled.

## Extension points

- **A new strategy** - implement `IAuthenticationStrategy`, register it under a name. Nothing else in the framework needs to know.
- **A new token service** - `AbstractBearerTokenService` under `services/bearer` is the base the JWS and JWKS services share (`AbstractJWKSTokenService` narrows it further for the two JWKS modes).
- **Payload field codecs** - `fieldCodecs` plus `aesAlgorithm` / `applicationSecret` on the JWS and JWKS options encrypt individual claim fields inside the token.
- **The auth controller** - `TDefineAuthControllerOpts.payload` swaps the Zod request/response schema of each generated route, and `serviceKey` points at your own authentication service.

## Related

- [Casbin Authorization](/architecture/authorization-casbin.md)
- [Component Model](/architecture/component-model.md)
- [Binding Key Namespaces](/conventions/binding-key-namespaces.md)
- [vert Example](/examples/vert.md)
