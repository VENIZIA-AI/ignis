---
title: Network request bags, the secrets registration and peer client types are typed, not any
description: "The fetcher options take records instead of any, the axios response is unknown, a secrets registration's config is typed by its provider, and the Vault client answers unknown."
packages: ['@venizia/ignis-helpers']
migration:
  - id: network-request-bags-typed
    symbols: [IRequestOptions, IAxiosRequestOptions, INodeFetchRequestOptions, QueryStringUtility.toQueryString]
    upgrade:
      before: |
        const query = QueryStringUtility.toQueryString({ params: someObject }); // AnyObject
        await fetcher.send({ url, params: { page: 1 }, headers: { 'x-count': 1 } });
      after: |
        // params is a Record<string, unknown>; headers is a Record<string, string>
        const query = QueryStringUtility.toQueryString({ params: someObject });
        await fetcher.send({ url, params: { page: 1 }, headers: { 'x-count': String(1) } });
    downgrade:
      steps:
        - "Pass any object as params, body and headers again; the older types were AnyObject."
  - id: axios-response-unknown
    symbols: [AxiosFetcher, TFetcherResponse]
    upgrade:
      before: |
        const response = await axiosFetcher.send({ url });
        const name: string = response.data.name; // any
      after: |
        // the data is unknown: name it with send<T> or parse it
        const response = await axiosFetcher.send<{ name: string }>({ url });
        const name = response.data.name;
    downgrade:
      steps:
        - "Read response.data without a type argument again; the older response data was any."
  - id: default-headers-merge-by-name
    symbols: [AxiosNetworkRequest, NodeFetchNetworkRequest]
    upgrade:
      steps:
        - "Nothing to change for a headers object. The node-fetch request merges the default `content-type` with yours through `Headers`, so a `Content-Type` you set replaces the default instead of sitting beside it, and header names are lowercase on the wire."
    downgrade:
      steps:
        - "Nothing to undo."
  - id: secrets-registration-by-provider
    symbols: [ISecretsRegistration, ISystemEnvsSecretsRegistration, IHashiCorpSecretsRegistration, IDotenvSecretsRegistration, SecretsHelperFactory]
    upgrade:
      before: |
        const registration: ISecretsRegistration = {
          provider: provider, // TSecretProvider
          config: { endpoint, auth }, // AnyObject
        };
      after: |
        // the provider selects the shape of config, so name the provider by its literal
        const registration: ISecretsRegistration = {
          provider: SecretProviders.HASHICORP_VAULT,
          config: { endpoint, auth },
        };
    downgrade:
      steps:
        - "Type the registration with a TSecretProvider variable and an untyped config again; the older registration was one interface with config: AnyObject."
  - id: vault-client-answers-unknown
    symbols: [IHashiCorpVaultHelperOptions, HashiCorpVaultHelper]
    upgrade:
      before: |
        const client = { token: '', read: async () => ({ data: {} }), /* ... */ };
        new HashiCorpVaultHelper({ endpoint, auth, client });
      after: |
        // an injected client's calls answer unknown; the helper reads what it needs and narrows it
        new HashiCorpVaultHelper({ endpoint, auth, client });
    downgrade:
      steps:
        - "Nothing to undo."
    data: "A login whose answer carries no client_token is refused with an error now; before, the helper kept an undefined token and failed on the first read."
  - id: pino-transport-type
    symbols: [PinoDestination, PinoBackingLogger]
    upgrade:
      steps:
        - "Nothing to change unless you call PinoDestination.build: it answers the pino transport stream (a ThreadStream) or undefined, where it answered a DestinationStream or undefined."
    downgrade:
      steps:
        - "Nothing to undo."
---

# Changelog - 2026-11-13

## Network request bags, the secrets registration and peer client types are typed, not any

<Badge type="warning" text="Breaking Change" />

**In one line.** The fetcher options, the secrets registration and the Vault client no longer say `any`; at runtime only two things differ, noted below.

## What changed

- **Fetchers.** `params` is a `Record<string, unknown>`, `headers` a `Record<string, string>`, and an axios response's data is `unknown` until you name it.
- **Default headers.** The node-fetch request merges its default `content-type` through `Headers`, so yours replaces it by name.
- **Secrets.** `ISecretsRegistration` is a union by `provider`, so `config` is the options of that provider.
- **Vault.** An injected client answers `unknown`, and a login with no `client_token` is refused.
- **Pino.** `PinoDestination.build` answers the transport stream type.

## Who is affected

- **Apps that pass non-string header values, read an axios response's data without a type, or build a secrets registration from a `TSecretProvider` variable.** See the migration below.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> These are type-level breaks. The typecheck names each line.

**Before:**

```typescript
await fetcher.send({ url, headers: { 'x-count': 1 } });
```

**After:**

```typescript
await fetcher.send({ url, headers: { 'x-count': String(1) } });
```
