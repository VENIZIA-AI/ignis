---
title: Network - Full Reference
description: Complete reference for every network helper class - HTTP fetchers, TCP/TLS socket client and server, UDP client - and every option and type
difficulty: intermediate
---

# Network - Full Reference

Exhaustive reference for `BaseNetworkRequest` and its fetchers, the TCP/TLS client-server hierarchy, `NetworkUdpClient`, the `UrlPolicy`/`UrlIngest` safety guard, and every option type. For a readable introduction and the most common tasks, start with the [Network overview](/extensions/helpers/network/).

## Find what you need

| You're looking for | Go to |
|---|---|
| The HTTP client base class and URL helpers | [BaseNetworkRequest](#basenetworkrequest) |
| Axios-backed HTTP client | [AxiosFetcher](#axiosfetcher) / [AxiosNetworkRequest](#axiosnetworkrequest) |
| Native-`fetch`-backed HTTP client | [NativeFetcher](#nativefetcher) / [NativeFetchNetworkRequest](#nativefetchnetworkrequest) |
| Schema, retry, hooks, status check on every call | [AbstractNetworkFetchableHelper](#abstractnetworkfetchablehelper) |
| Why the `QUERY` method must reach the wire uppercase | [HTTP.Methods](#http-methods) |
| Secret redaction in request logs | [Request Logging and Redaction](#request-logging-and-redaction) |
| Plain TCP or TLS server, client tracking, authentication | [BaseNetworkTcpServer](#basenetworktcpserver) |
| Plain TCP or TLS client, auto-reconnect behavior | [BaseNetworkTcpClient](#basenetworktcpclient) |
| UDP client and multicast | [NetworkUdpClient](#networkudpclient) |
| Fetching a url a user supplied, without opening an SSRF hole | [URL Safety](#url-safety) |
| Every option and type in one place | [Types Reference](#types-reference) |

**Files:**

- [`packages/helpers/src/modules/network/http-request/base-network-request.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/base-network-request.helper.ts) - `BaseNetworkRequest`
- [`packages/helpers/src/modules/network/http-request/fetcher/base-fetcher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/fetcher/base-fetcher.ts) - `IFetchable`, `IRequestOptions`, `AbstractNetworkFetchableHelper`
- [`packages/helpers/src/modules/network/http-request/fetcher/native-fetcher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/fetcher/native-fetcher.ts) - `NativeFetcher`, `NativeFetchNetworkRequest`
- [`packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts) - `AxiosFetcher`, `AxiosNetworkRequest` (`@venizia/ignis-helpers/axios` sub-path)
- [`packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts) - `BaseNetworkTcpServer`, `ITcpSocketClient`, `ITcpSocketServerOptions`
- [`packages/helpers/src/modules/network/tcp-socket/base-tcp-client.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/base-tcp-client.helper.ts) - `BaseNetworkTcpClient`, `INetworkTcpClientProps`
- [`packages/helpers/src/modules/network/tcp-socket/network-tcp-server.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/network-tcp-server.helper.ts) - `NetworkTcpServer`
- [`packages/helpers/src/modules/network/tcp-socket/network-tcp-client.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/network-tcp-client.helper.ts) - `NetworkTcpClient`
- [`packages/helpers/src/modules/network/tcp-socket/network-tls-tcp-server.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/network-tls-tcp-server.helper.ts) - `NetworkTlsTcpServer`
- [`packages/helpers/src/modules/network/tcp-socket/network-tls-tcp-client.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/network-tls-tcp-client.helper.ts) - `NetworkTlsTcpClient`
- [`packages/helpers/src/modules/network/udp-socket/network-udp-client.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/udp-socket/network-udp-client.helper.ts) - `NetworkUdpClient`, `INetworkUdpClientProps`
- [`packages/helpers/src/modules/network/utilities/url-safety/policy.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/utilities/url-safety/policy.ts) - `UrlPolicy`
- [`packages/helpers/src/modules/network/utilities/url-safety/ingest.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/utilities/url-safety/ingest.ts) - `UrlIngest`
- [`packages/helpers/src/modules/network/utilities/url-safety/common/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/utilities/url-safety/common) - `IUrlSafetyPolicy`, `UrlSafetyDefaults`, `UrlSchemes`, `UrlSafetyErrors`
- [`packages/helpers/src/common/redact.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/redact.ts) - `RedactUtility.redactSecrets`, `RedactUtility.redactUrlCredentials`
- [`packages/helpers/src/common/constants/http.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/http.ts) - `HTTP.Methods`, `THttpMethod`

## Architecture

```
BaseHelper
  ├── BaseNetworkRequest<T extends TFetcherVariant>
  │     ├── AxiosNetworkRequest        (T = 'axios')
  │     └── NativeFetchNetworkRequest  (T = 'native')
  │
  ├── BaseNetworkTcpServer<ServerOpts, ServerType, ClientType>
  │     ├── NetworkTcpServer           (net.createServer, net.Socket)
  │     └── NetworkTlsTcpServer        (tls.createServer, tls.TLSSocket)
  │
  ├── BaseNetworkTcpClient<ClientOpts, ClientType>
  │     ├── NetworkTcpClient           (net.connect, net.Socket)
  │     └── NetworkTlsTcpClient        (tls.connect, tls.TLSSocket)
  │
  └── NetworkUdpClient

AbstractNetworkFetchableHelper<V, RQ, RS>  (implements IFetchable, NOT a BaseHelper)
  ├── AxiosFetcher                     (V = 'axios')
  └── NativeFetcher                    (V = 'native')
```

Every class that extends `BaseHelper` inherits scoped logging via `this.logger`. `AbstractNetworkFetchableHelper` and its two fetchers do **not** extend `BaseHelper`. They accept an optional `logger` parameter per call instead - see [Request Logging and Redaction](#request-logging-and-redaction).

---

## HTTP Request API

### BaseNetworkRequest

```typescript
class BaseNetworkRequest<T extends TFetcherVariant> extends BaseHelper
```

Base class for HTTP request helpers. Holds a base URL and delegates to an `IFetchable` fetcher.

#### Constructor

```typescript
constructor(opts: {
  name: string;
  baseUrl?: string;
  fetcher: IFetchable<T, IRequestOptions, TFetcherResponse<T>>;
})
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Helper name, used as both `scope` and `identifier` for logging |
| `baseUrl` | `string` | Base URL prepended to request paths. Defaults to `''` |
| `fetcher` | `IFetchable` | The underlying HTTP fetcher implementation |

#### Methods

##### `getRequestUrl(opts)`

Builds a full URL by combining a base URL with path segments. Throws if no base URL is available.

```typescript
getRequestUrl(opts: {
  baseUrl?: string;
  paths: Array<string>;
}): string
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `baseUrl` | `string` | Overrides the instance's base URL; falls back to `this.baseUrl` |
| `paths` | `string[]` | Path segments to append. Each is prefixed with `/` if missing |

An explicit empty `baseUrl` does **not** fall back - it throws.

**Throws:** `ApplicationError` (via `getError`, `statusCode: 500`) with message `'[getRequestUrl] Invalid configuration for third party request base url!'` when both `opts.baseUrl` and `this.baseUrl` resolve to empty.

**Example:**

```typescript
client.getRequestUrl({ paths: ['v1', 'users', '123'] });
// => 'https://api.example.com/v1/users/123'

client.getRequestUrl({ baseUrl: 'https://other.api.com', paths: ['health'] });
// => 'https://other.api.com/health'
```

##### `getRequestPath(opts)`

Joins path segments, ensuring each starts with `/`. An empty `paths` array joins to `''`.

```typescript
getRequestPath(opts: { paths: Array<string> }): string
```

**Example:**

```typescript
client.getRequestPath({ paths: ['v1', 'users'] });
// => '/v1/users'
```

##### `getNetworkService()`

Returns the underlying `IFetchable` fetcher instance.

```typescript
getNetworkService(): IFetchable<T, IRequestOptions, TFetcherResponse<T>>
```

##### `getWorker()`

Returns the raw HTTP client from the fetcher (`AxiosInstance` for Axios, `typeof fetch` for Node Fetch). Delegates to `fetcher.getWorker()`.

```typescript
getWorker(): TFetcherWorker<T>
```

---

### IFetchable Interface

```typescript
interface IFetchable<
  V extends TFetcherVariant,
  RQ extends IRequestOptions,
  RS extends TFetcherResponse<V>,
> {
  send(opts: RQ & { schema?: undefined }, logger?: TFetcherLogger): Promise<RS>;
  send<S extends z.ZodType>(opts: RQ & { schema: S }, logger?: TFetcherLogger): Promise<IFetchParsed<z.infer<S>, RS>>;
  // get, post, put, patch, delete and query have the same two overloads

  getWorker(): TFetcherWorker<V>;
}
```

Without `schema` a call answers the raw `Response` (`AxiosResponse` for Axios). With `schema` it answers `IFetchParsed`:

```typescript
interface IFetchParsed<D, RS> {
  data: D;          // z.infer of the schema
  status: number;
  headers: Headers;
  response: RS;     // the raw answer
}
```

All shortcuts (`get`, `post`, `put`, `patch`, `delete`, `query`) set `method` and call the same pipeline as `send()`. `query` sends the HTTP `QUERY` method ([RFC 9110/10008](https://www.ietf.org/archive/id/draft-ietf-httpbis-safe-method-w-body-10.html)). It behaves like `GET` but carries a body - useful for search payloads too large to fit a query string. `send<T>()` no longer exists: pass a `schema` to get a typed body.

### IRequestOptions

Every field is per call, and wins over the fetcher's `defaults`.

| Field | Type | Meaning |
|---|---|---|
| `url` | `string` | Absolute url |
| `method` | `THttpMethod` | Defaults to `get`; either case |
| `params` | `Record<string, unknown>` | Written into the url query |
| `headers` | `Headers \| Record<string, string \| null \| undefined>` | Merged per header with the defaults; the call wins; `null` or `undefined` removes a default |
| `body` | per fetcher | The request body |
| `timeout` | `number` | Milliseconds, **per attempt** |
| `signal` | `AbortSignal` | The caller's own abort. It rejects with the caller's reason, apart from a timeout (`TimeoutError`) |
| `schema` | `z.ZodType` | Parse the JSON body; a mismatch is a [`FetchSchemaError`](#fetchschemaerror) |
| `acceptStatus` | `(status: number) => boolean` | The one opt-out of "a status outside 2xx throws". See [Status check](#status-check) |
| `retry` | `IFetchRetryOptions` | Present turns retrying on. See [Retry](#retry) |
| `guard` | `IUrlSafetyPolicy` | Present turns the [url guard](#url-safety) on for this call |
| `maxBytes` | `number` | Cap on the response body |
| `maxRedirects` | `number` | `0` returns a 3xx as a `UrlFetchError`; a positive number walks the redirects by hand |

### HTTP.Methods

The const-class every fetcher dispatches on:

```typescript
HTTP.Methods = {
  GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch',
  DELETE: 'delete', HEAD: 'head', OPTIONS: 'options', QUERY: 'query',
} as const;

type THttpMethod = ValueOf<typeof HTTP.Methods> | Uppercase<ValueOf<typeof HTTP.Methods>>;
```

> [!IMPORTANT]
> - **Every `HTTP.Methods` token is lowercase.** `@hono/zod-openapi` route definitions accept no other case.
> - **Both fetchers accept either case on input**, `'post'` or `'POST'`. Each calls `method.toUpperCase()` immediately before dispatching to its transport.
> - **This is not cosmetic.** A lowercase `patch` or `query` that reaches a server unchanged is rejected by most servers.

---

### AbstractNetworkFetchableHelper

```typescript
abstract class AbstractNetworkFetchableHelper<
  V extends TFetcherVariant,
  RQ extends IRequestOptions,
  RS extends TFetcherResponse<V>,
> implements IFetchable<V, RQ, RS>
```

The one pipeline both fetchers run. A concrete fetcher supplies only the exchange (one request on the wire); the status check, the schema, retries, hooks, the guard, redirects and the body cap are shared. Does **not** extend `BaseHelper` - it has no `this.logger`.

#### Constructor

```typescript
constructor(opts: {
  name: string;
  variant: V;
  defaults?: IFetcherDefaults;
  hooks?: IFetcherHooks;
  guardEngine?: IFetchGuard;
})
```

| Option | Meaning |
|---|---|
| `defaults` | `{ timeout, headers, retry, maxBytes, guard }` for every call, see below |
| `hooks` | `{ onRequest, onResponse, onError }`, see [Hooks](#hooks) |
| `guardEngine` | The server half of the url guard: pass `UrlGuard` |

A call replaces `timeout`, `retry`, `maxBytes` and `guard`; `headers` merge per header. A call can replace a default `guard` with its own policy, never remove it. A call with `guard` and no engine fails with an error that says so.

#### Pipeline order

For each attempt: `onRequest` → the guard vets the url and pins its addresses → the request is sent → redirects are walked by hand → `onResponse` → the status check → the body cap and the schema. A retry repeats all of it, so a signature and a DNS lookup are fresh each time.

#### Status check

A status outside 2xx throws `UrlFetchError<RS>` with `status`, `url`, `headers`, `location` (a redirect) and the `response`, whose body is already cancelled. A 3xx the client followed is judged on its final answer.

`acceptStatus` is the only opt-out:

```typescript
const response = await fetcher.get({
  url,
  acceptStatus: (status) => status === 404 || status < 300,
});
```

#### Retry

`retry` is `IFetchRetryOptions`: `maxAttempts` (default 3), `maxTotalMs` (the budget across every attempt and wait), `backoff`, `shouldRetry`, `onRetry`. It runs on `RetryHelper.executeWithRetry`.

- Retried by default: a network error, a timeout, a 5xx and a 429.
- Never retried by default: any other 4xx, a 3xx, a guard refusal, a schema mismatch, a caller abort.
- A `Retry-After` header (seconds or an HTTP date) on a 429 or 503 is the least wait before the next attempt. A wait above `backoff.maxDelayMs` (30 seconds by default) or above `maxTotalMs` ends the retries: the last error is thrown. A negative or garbled value is ignored.
- A POST is retried only because the caller passed `retry`. Keep the call idempotent (an idempotency key).
- A body that can be sent only once (a stream, a `FormData`) cannot be retried when `maxAttempts` is above 1: the call fails before anything is sent. A string, bytes, a `Blob`, `URLSearchParams`, an array and a plain object can.
- `shouldRetry` replaces the default decision.

#### Hooks

Exactly three functions, none returns a value.

| Hook | Runs | Gets |
|---|---|---|
| `onRequest` | Before every send, each retry attempt included | `{ method, url, headers, attempt }` |
| `onResponse` | Once per attempt, before the status check and the schema | `{ request, status, headers, durationMs }` |
| `onError` | Once, with the final error, which is then rethrown | `{ request, error, attempt }` |

`headers` of `onRequest` is mutable; its `url` is read-only, so a hook cannot send the call to a host the guard did not vet. `onError` sees a timeout, a network failure, a refused status, a schema mismatch and a guard refusal. A hook that throws fails the call. For signed service calls see [the signed service calls hook](/extensions/components/authentication/usage).

#### FetchSchemaError

A body that does not fit the `schema` (or is not JSON, or is empty) throws `FetchSchemaError`: status code 502, code `core.fetch.schema_mismatch`, with `status`, `url` and `issues: Array<{ path, code }>`. It names the paths and the rules. It never carries the body or the values.

#### Methods

##### `send` / `get` / `post` / `put` / `patch` / `delete` / `query`

See [IFetchable](#ifetchable-interface). Each takes `(opts, logger?)`.

##### `getProtocol(url)`

Returns `HTTP.Protocols.HTTP` (`'http'`) if `url` starts with `'http:'`, otherwise `HTTP.Protocols.HTTPS` (`'https'`).

##### `getWorker()`

Returns the underlying HTTP client instance (`fetch` or the axios instance).

---

### AxiosFetcher

```typescript
class AxiosFetcher extends AbstractNetworkFetchableHelper<
  'axios',
  IAxiosRequestOptions,
  AxiosResponse<unknown>,
  AxiosInstance
>
```

Axios as the client. The status check, redirects and deadline belong to the pipeline: the instance runs with `validateStatus: () => true`, so axios no longer throws on a status.

#### Constructor

```typescript
constructor(opts: {
  name: string;
  defaultConfigs?: AxiosRequestConfig;
  defaults?: IFetcherDefaults;
  hooks?: IFetcherHooks;
  guardEngine?: IFetchGuard;
  logger?: ILogger;
  rejectUnauthorized?: boolean;
})
```

`opts.logger`, if provided, logs `'Creating new network request worker instance! Name: %s'` once at construction time.

#### IAxiosRequestOptions

An axios config where `body` is sent as axios `data`, plus [`IRequestOptions`](#irequestoptions). The fields the pipeline owns (`url`, `method`, `params`, `data`, `headers`, `signal`, `timeout`, `maxRedirects`, `validateStatus`) are not taken from the axios config.

> [!NOTE]
> - **`maxBytes` is `maxContentLength` in axios.** Axios stops the read when the body crosses it, with its own error, not the cap's message.
> - **HTTPS gets a shared `https.Agent`** with certificate verification ON and keep-alive. Pass `rejectUnauthorized: false` only when you mean to accept an unverified certificate. A caller `httpsAgent` wins.
> - **A guarded call accepts only an allowlist of request options**, per call and in `defaultConfigs`: `baseURL`, `auth`, `withCredentials`, `responseType`, `responseEncoding`, the xsrf options, `transformRequest`, `transformResponse`, `paramsSerializer`, `maxContentLength`, `maxBodyLength`, `maxRate`, `decompress`, `transitional`, `formSerializer`, `allowAbsoluteUrls`, `cancelToken`, the progress callbacks and `rejectUnauthorized`. Any other key is refused with a message that names it: an agent, `socketPath`, `lookup`, `transport`, `proxy`, `httpVersion` or `http2Options` (HTTP/2 connects on its own and ignores the pinned agent), a custom `adapter`, or an option axios adds later. It also refuses `guard.proxy` (the request would go direct) and `responseType: 'stream'` (the pinned agent ends with the call and a stream is not capped): use a `NativeFetcher` for those.
> - **A guarded call never uses the shared agent.** It gets an agent of its own whose `lookup` answers only the vetted addresses, with keep-alive off, destroyed after the exchange: no pin outlives the call, and the certificate is still verified for the name you asked for. A test pins SNI, certificate verification and the environment proxy on a real TLS server.

---

### AxiosNetworkRequest

```typescript
class AxiosNetworkRequest extends BaseNetworkRequest<'axios'>
```

Pre-configured HTTP client using Axios. Import only from the sub-path - `import { AxiosNetworkRequest } from '@venizia/ignis-helpers/axios'`.

```typescript
interface IAxiosNetworkRequestOptions {
  name: string;
  networkOptions: Omit<AxiosRequestConfig, 'baseURL' | 'headers' | 'timeout'> & {
    baseUrl?: string;
    headers?: Record<string, string>;
    timeout?: number;
  };
  defaults?: IFetcherDefaults;
  hooks?: IFetcherHooks;
  guardEngine?: IFetchGuard;
}
```

| Setting | Default |
|---------|---------|
| `headers['content-type']` | `'application/json; charset=utf-8'` |
| `withCredentials` | `true` |
| `timeout` | `60000` (1 minute), per attempt |

`validateStatus` is gone: a status outside 2xx throws a `UrlFetchError`; use `acceptStatus` per call. `networkOptions.baseUrl` maps to Axios's `baseURL`.

---

### NativeFetcher

```typescript
class NativeFetcher extends AbstractNetworkFetchableHelper<
  'native',
  INativeFetchRequestOptions,
  Response,
  typeof fetch
>
```

Native `fetch` as the client.

#### Constructor

```typescript
constructor(opts: {
  name: string;
  defaultConfigs?: TNativeRequestInit;
  defaults?: IFetcherDefaults;
  hooks?: IFetcherHooks;
  guardEngine?: IFetchGuard;
  queryString?: IQueryStringOptions;
  logger?: TFetcherLogger;
})
```

`defaultConfigs` carries the `RequestInit` settings the pipeline does not own (`credentials`, `mode`, `cache`, ...); `headers` and `signal` are not part of it, they belong to `defaults` and to the call. `queryString` decides how `params` are written into the url (see [`QueryStringUtility.toQueryString`](#querystringutility-toquerystring)). `TFetcherLogger` is `Pick<ILogger, 'debug' | 'info'>`. `getWorker()` returns the global `fetch`.

#### INativeFetchRequestOptions

`RequestInit` (less `body`, `headers`, `method`, `signal`, `redirect`, which the pipeline owns) plus [`IRequestOptions`](#irequestoptions).

#### Behavior

- `method` defaults to `get` and is uppercased before dispatch.
- `body` is sent as given when it is a string, `Blob`, `ArrayBuffer`, typed array, `FormData`, `URLSearchParams` or `ReadableStream`; a plain object or an array is JSON-encoded; `null` or `undefined` sends no body. A `GET` or `HEAD` with a body is refused.
- Query `params` are appended to `url`; the separator is `?` when the url has no query yet, `&` when it has.
- `timeout` is per attempt and composed with the caller's `signal`, never substituted.
- With `guard`, the request goes to the address the guard vetted (`Host` and TLS server name stay the url's own), and `HTTP_PROXY` / `HTTPS_PROXY` is ignored on that connection. With a guard only `credentials`, `mode`, `cache`, `referrer`, `referrerPolicy`, `integrity`, `keepalive` and `priority` are accepted besides the pipeline's own options, per call and in `defaultConfigs`; any other key (`unix`, `dispatcher`, `proxy`, `tls`, one Bun adds later) is refused. `guard.proxy` is the one way through a proxy.

---

### NativeFetchNetworkRequest

```typescript
class NativeFetchNetworkRequest extends BaseNetworkRequest<'native'>
```

Pre-configured HTTP client using native `fetch`. Exported from the root barrel - no extra dependency.

```typescript
interface INativeFetchNetworkRequestOptions {
  name: string;
  networkOptions: RequestInit & {
    baseUrl?: string;
    queryString?: IQueryStringOptions;
  };
  defaults?: IFetcherDefaults;
  hooks?: IFetcherHooks;
  guardEngine?: IFetchGuard;
}
```

| Setting | Default |
|---------|---------|
| `headers['content-type']` | `'application/json; charset=utf-8'` |

A caller's `Content-Type`, in any case, replaces the default. Set `timeout` in `defaults` or on the call: it is per attempt.

---

### `QueryStringUtility.toQueryString`

```typescript
QueryStringUtility.toQueryString(opts: { params: Record<string, unknown>; nullish?: 'empty' | 'skip'; nested?: 'drop' | 'json' }): string
```

Writes `params` as a query string without `node:querystring`, so it works in a browser. The defaults match `node:querystring`: an array repeats its key (`a=1&a=2`), `null` and `undefined` give an empty value (`a=`), an object gives an empty value, a space is `%20`.

| Option | Value | Effect |
|---|---|---|
| `nullish` | `'empty'` (default) | `a=` |
| `nullish` | `'skip'` | The pair is left out (inside an array too) |
| `nested` | `'drop'` (default) | An object is an empty value; an array repeats its key |
| `nested` | `'json'` | An object **or an array** is ONE JSON parameter |

With `nested: 'json'` an array becomes `ids=%5B1%2C2%5D` and an object `filter=%7B%22where%22...`; primitives are unchanged.

A client that sends a JSON filter passes `{ nullish: 'skip', nested: 'json' }`, through `NativeFetchNetworkRequest`'s `networkOptions.queryString`.

---

### Request Logging and Redaction

Neither fetcher logs anything by default. `send()` and every shortcut accept an **optional** `logger` as the second argument, guarded internally with `logger?.debug(...)` (the axios fetcher keeps `logger?.for(...)` and `info`). Pass a logger to get a line per request - typically `this.logger`, whether the caller is a `BaseHelper` subclass or extends `BaseNetworkRequest` directly:

```typescript
await this.getNetworkService().post({ url, body }, this.logger);
```

Whenever a logger is passed, IGNIS runs the assembled request config through `RedactUtility.redactSecrets()` before the log line is written. That covers `url`, `method`, `headers`, `body`/`data`, and any other option. Redaction matches by key name, case-insensitively, at any depth, against `SECRET_KEY_PATTERN`:

- **Options-object (camelCase):** `pass`, `password`, `passphrase`, `secret`, `token`, `apiKey`, `accessKey`, `secretKey`, `privateKey`, `key`, `cert`, `ca`, `pfx`, `credential`, `credentials`, `authorization`, `auth`, `jwtSecret`, `applicationSecret`, `connectionString`.
- **Options-object (snake_case):** `api_key`, `access_key`, `secret_key`, `private_key`.
- **Prefixed suffix rules:** any key ending in `_token` / `Token`, `_secret` / `Secret`, `_password` / `Password`, or `_credential(s)` / `Credential(s)` (`dbCredential`, `webhookSecret`, `admin_password`).
- **HTTP header spellings:** `cookie`, `set-cookie`, `proxy-authorization`, `www-authenticate`, and any `(x-)?(api\|auth\|access\|secret\|session\|csrf\|xsrf)-(key\|token\|secret\|id)` pattern (for example `x-api-key`, `x-auth-token`, `x-csrf-token`).

Source: [`redact.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/redact.ts) `SECRET_KEY_PATTERN`.

A matched value is replaced with `'[REDACTED]'`. `Buffer`/typed-array values under a non-matching key are summarized as `'[Binary N bytes]'` rather than serialized. There is nothing to configure beyond passing the logger - you never call `redactSecrets()` yourself at the call site.

---

## TCP Socket API

### BaseNetworkTcpServer

```typescript
class BaseNetworkTcpServer<
  SocketServerOptions extends ServerOpts = ServerOpts,
  SocketServerType extends SocketServer = SocketServer,
  SocketClientType extends SocketClient = SocketClient,
> extends BaseHelper
```

Abstract TCP server with client tracking, authentication flow, and event delegation.

#### Constructor

```typescript
constructor(opts: ITcpSocketServerOptions<SocketServerOptions, SocketServerType, SocketClientType>)
```

**Throws:** `ApplicationError` when `authenticateOptions.required` is `true` and `duration` is missing, `0`, or negative. Message: `'TCP Server | Invalid authenticate duration | Required duration for authenticateOptions'`.

The constructor calls `configure()`, which creates the server via `createServerFn` and starts listening.

#### Protected Properties

| Property | Type | Description |
|----------|------|-------------|
| `serverOptions` | `Partial<SocketServerOptions>` | Server creation options |
| `listenOptions` | `Partial<ListenOptions>` | Listen configuration |
| `authenticateOptions` | `{ required: boolean; duration?: number }` | Auth settings |
| `clients` | `Record<string, ITcpSocketClient<SocketClientType>>` | Connected client registry |
| `server` | `SocketServerType` | The underlying server instance |
| `extraEvents` | `Record<string, (opts) => ValueOrPromise<void>>` | Additional per-client socket events to register |

- **Hooks never crash the process.** `onClientData`, `onClientConnected`, `onClientClose`, `onClientError`, `onServerReady`, `onServerError`, and each `extraEvents` entry all run through an internal `invokeHook()` wrapper.
- **Why it exists.** A hook throwing synchronously inside a raw `net`/`tls` event listener would otherwise be an uncaught exception. That crashes the process. `invokeHook()` catches the throw and logs it instead.

#### Methods

##### `configure()`

Creates the server using `createServerFn`, registers a server-level `error` listener (routed to `onServerError`, never left to crash the process), and starts listening. Called automatically by the constructor.

```typescript
configure(): void
```

##### `onNewConnection(opts)`

Handles a new client connection:

- Assigns a unique ID via `ParseUtility.getUID()`.
- Registers `data`/`error`/`close`/`extraEvents` listeners on the socket.
- Tracks the client in the `clients` registry.
- Invokes `onClientConnected`.
- Starts the authentication kick-timer when `authenticateOptions.required` is `true`.

```typescript
onNewConnection(opts: { socket: SocketClientType }): void
```

##### `getClients()` / `getClient(opts)` / `getServer()`

```typescript
getClients(): Record<string, ITcpSocketClient<SocketClientType>>
getClient(opts: { id: string }): ITcpSocketClient<SocketClientType> | undefined
getServer(): SocketServerType
```

##### `doAuthenticate(opts)`

Transitions a client's authentication state.

```typescript
doAuthenticate(opts: {
  id: string;
  state: 'unauthorized' | 'authenticating' | 'authenticated';
}): void
```

| New state | Effect |
|---|---|
| `'authenticated'` | Sets `storage.authenticatedAt` to the current `Date`; clears the pending kick-timer |
| `'unauthorized'` / `'authenticating'` | Sets `storage.authenticatedAt` to `null` |

##### `emit(opts)`

Writes data to a specific client's socket. Never throws - each failure case logs and returns instead:

| Condition | Log level |
|-----------|-----------|
| Client not found for `clientId` | `error` |
| Socket not writable | `error` |
| Payload empty (`!payload?.length`) | `info` |

```typescript
emit(opts: { clientId: string; payload: Buffer | string }): void
```

##### `shutdown()`

Tears the server down completely and resolves even while clients are still attached.

```typescript
async shutdown(): Promise<void>
```

**Order of operations:**

1. Clears every client's pending authenticate kick-timer.
2. Destroys every client socket.
3. Empties the `clients` registry.
4. Calls `server.close()` and awaits its callback.

- **Why this order.** `server.close()` alone never resolves while a socket is still attached. A caller reaching through `getServer().close()` on a busy server would hang forever.
- **Idempotent.** A second call is a no-op that resolves cleanly.
- **Safe on a server that never finished `listen()`.** Logs the resulting `ERR_SERVER_NOT_RUNNING` rather than throwing.
- **After `shutdown()`**, new connection attempts are refused.

---

### ITcpSocketClient

```typescript
interface ITcpSocketClient<SocketClientType> {
  id: string;
  socket: SocketClientType;
  state: 'unauthorized' | 'authenticating' | 'authenticated';
  subscriptions: Set<string>;
  storage: {
    connectedAt: Date;
    authenticatedAt: Date | null;
    authenticateTimeout?: ReturnType<typeof setTimeout> | null;
    [additionField: symbol | string]: unknown;
  };
}
```

---

### NetworkTcpServer

```typescript
class NetworkTcpServer extends BaseNetworkTcpServer<ServerOpts, Server, Socket>
```

Plain TCP server using `net.createServer`.

#### Constructor

```typescript
constructor(opts: Omit<ITcpSocketServerOptions, 'createServerFn'>)
```

The `createServerFn` is pre-set to `net.createServer`. `scope` is hardcoded to `'NetworkTcpServer'`, overriding any `opts.scope`.

#### Static Methods

##### `newInstance(opts)`

```typescript
static newInstance(
  opts: Omit<ITcpSocketServerOptions, 'createServerFn'>
): NetworkTcpServer
```

---

### NetworkTlsTcpServer

```typescript
class NetworkTlsTcpServer extends BaseNetworkTcpServer<TlsOptions, tls.Server, TLSSocket>
```

TLS-encrypted TCP server using `tls.createServer`.

#### Constructor

```typescript
constructor(opts: Omit<ITcpSocketServerOptions<TlsOptions, tls.Server, TLSSocket>, 'createServerFn'>)
```

The `createServerFn` is pre-set to `tls.createServer`. `scope` is hardcoded to `'NetworkTlsTcpServer'`. Pass TLS certificates and keys in `serverOptions` (type `TlsOptions` from `node:tls`). Every method, including `shutdown()`, is identical to `NetworkTcpServer`.

#### Static Methods

##### `newInstance(opts)`

```typescript
static newInstance(
  opts: Omit<ITcpSocketServerOptions<TlsOptions, tls.Server, TLSSocket>, 'createServerFn'>
): NetworkTlsTcpServer
```

---

### BaseNetworkTcpClient

```typescript
class BaseNetworkTcpClient<
  SocketClientOptions extends PlainConnectionOptions | TlsConnectionOptions,
  SocketClientType extends PlainSocketClient | TlsSocketClient,
> extends BaseHelper
```

Abstract TCP client with auto-reconnect, encoding support, and lifecycle hooks.

#### Constructor

```typescript
constructor(opts: INetworkTcpClientProps<SocketClientOptions, SocketClientType>)
```

Does **not** call `connect()` automatically. Construction only stores options - call `connect({ resetReconnectCounter })` explicitly.

#### Protected Properties

| Property | Type | Description |
|----------|------|-------------|
| `client` | `SocketClientType \| null` | The underlying socket, or `null`/`undefined` when disconnected |
| `options` | `SocketClientOptions` | Connection options |
| `reconnect` | `boolean` | Whether auto-reconnect is enabled (default: `false`) |
| `retry` | `{ maxReconnect: number; currentReconnect: number }` | Reconnect state. `maxReconnect` defaults to `5` |
| `encoding` | `BufferEncoding \| undefined` | Socket encoding |

##### `getLoggableOptions()`

```typescript
protected getLoggableOptions(): unknown
```

Returns `RedactUtility.redactSecrets({ value: this.options })`. A TLS client's `options` **is** its private key material - `key`/`cert`/`passphrase`. Every internal log call uses this method instead of logging `this.options` directly, or the key would be written to every log file and aggregator downstream.

#### Methods

##### `connect(opts)`

Establishes the connection:

- No-op with a log line if already connected (`isConnected()`) or if `options` is empty.
- Otherwise, in order:
  1. Destroys any stale `client` first.
  2. Creates the socket via `createClientFn`.
  3. Registers `data`/`close`/`error` listeners.
  4. Applies `encoding`, if set.

```typescript
connect(opts: { resetReconnectCounter: boolean }): void
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `resetReconnectCounter` | `boolean` | If `true`, resets `retry.currentReconnect` to `0` before connecting |

##### `disconnect()`

Destroys the socket, clears the reconnect timeout, and sets `client` to `null`. No-op with a log line if `client` is not set.

```typescript
disconnect(): void
```

##### `forceReconnect()`

Calls `disconnect()` then `connect({ resetReconnectCounter: true })`.

```typescript
forceReconnect(): void
```

##### `isConnected()`

Returns a truthy value if `client` exists and its `readyState` is not `'closed'`.

```typescript
isConnected(): SocketClientType | null | undefined
```

##### `emit(opts)`

Writes data to the server. Logs and returns without throwing if `client` is not initialized or the payload is empty.

```typescript
emit(opts: { payload: Buffer | string }): void
```

##### `getClient()`

```typescript
getClient(): SocketClientType | null | undefined
```

##### `handleConnected()` / `handleData(_opts)` / `handleClosed()` / `handleError(error)`

Default handlers used when the matching `onConnected`/`onData`/`onClosed`/`onError` option is omitted.

```typescript
handleConnected(): void                                                   // Logs, resets retry.currentReconnect to 0
handleData(_opts: { identifier: string; message: string | Buffer }): void // No-op
handleClosed(): void                                                      // Logs the closure
handleError(error: unknown): void                                             // Logs; schedules a reconnect if eligible
```

**Reconnect gate on `handleError`:**

| Condition | Result |
|-----------|--------|
| `reconnect` is `false` | No reconnect - the first guard returns immediately |
| `retry.currentReconnect >= retry.maxReconnect` | No reconnect - the first guard returns immediately |
| `maxReconnect === -1` | **No reconnect, ever** (see below) |
| `reconnect` is `true` and `currentReconnect < maxReconnect` (with `maxReconnect >= 0`) | Reconnect scheduled |

With `maxReconnect === -1`, `currentReconnect` starts at `0` and `0 >= -1` is already true, so the first guard returns before any attempt is made.

> [!IMPORTANT]
> - **`maxReconnect: -1` does not mean unlimited reconnects - it disables reconnection entirely.** That is the opposite of the "`-1` = unlimited" convention used elsewhere in the framework - the Redis retry helper, for example.
> - **A second guard further down the method is dead code.** `if (maxReconnect > -1 && currentReconnect >= maxReconnect)` can never be true. By the time control reaches it, the first guard has already ruled out `currentReconnect >= maxReconnect`.
> - Source: [`base-tcp-client.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/base-tcp-client.helper.ts).

The reconnect delay is a **fixed 5000 ms**. There is no backoff growth on the TCP/TLS client, unlike the Redis helper's exponential strategy.

---

### NetworkTcpClient

```typescript
class NetworkTcpClient extends BaseNetworkTcpClient<TcpSocketConnectOpts, Socket>
```

Plain TCP client using `net.connect`.

#### Constructor

```typescript
constructor(
  opts: Omit<INetworkTcpClientProps<TcpSocketConnectOpts, Socket>, 'createClientFn'>
)
```

The `createClientFn` is pre-set to `net.connect`. `scope` is hardcoded to `'NetworkTcpClient'`.

#### Static Methods

##### `newInstance(opts)`

```typescript
static newInstance(
  opts: Omit<INetworkTcpClientProps<TcpSocketConnectOpts, Socket>, 'createClientFn'>
): NetworkTcpClient
```

---

### NetworkTlsTcpClient

```typescript
class NetworkTlsTcpClient extends BaseNetworkTcpClient<ConnectionOptions, TLSSocket>
```

TLS-encrypted TCP client using `tls.connect`.

#### Constructor

```typescript
constructor(
  opts: Omit<INetworkTcpClientProps<ConnectionOptions, TLSSocket>, 'createClientFn'>
)
```

The `createClientFn` is pre-set to `tls.connect`. `scope` is hardcoded to `'NetworkTlsTcpClient'`. Pass TLS certificates and keys in `options` (type `ConnectionOptions` from `node:tls`). Every method is identical to `NetworkTcpClient`.

#### Static Methods

##### `newInstance(opts)`

```typescript
static newInstance(
  opts: Omit<INetworkTcpClientProps<ConnectionOptions, TLSSocket>, 'createClientFn'>
): NetworkTlsTcpClient
```

---

## UDP Socket API

### NetworkUdpClient

```typescript
class NetworkUdpClient extends BaseHelper
```

UDP datagram client with multicast support, using `node:dgram` internally (`type: 'udp4'`). No client/server split - one class handles both send and receive. `scope` is always hardcoded to `'NetworkUdpClient'` (no `scope` option exists on `INetworkUdpClientProps`).

#### Constructor

```typescript
constructor(opts: INetworkUdpClientProps)
```

Construction only stores options; call `connect()` explicitly to bind the socket.

#### Static Methods

##### `newInstance(opts)`

```typescript
static newInstance(opts: INetworkUdpClientProps): NetworkUdpClient
```

#### Methods

##### `connect()`

Creates a `dgram.Socket` and binds it, in order:

1. Creates the socket (`type: 'udp4'`, `reuseAddr` from options).
2. Registers `close`/`error`/`listening`/`message` listeners.
3. Binds to `port`/`host`.

Each listener routes through an internal `invokeHook()` wrapper - the same synchronous-throw guard as the TCP server. `onBind` fires after binding completes; it's the place to join multicast groups via `socket.addMembership(group, iface)`.

```typescript
connect(): void
```

No-op with a log line in two cases: `client` is already set, or `port` fails `Number.isInteger(port) && port >= 0`. Port `0` itself is valid - it means "let the OS assign a free port" - and is accepted.

##### `disconnect()`

Closes the socket and sets `client` to `null`. No-op with a log line if `client` is not set.

```typescript
disconnect(): void
```

##### `isConnected()`

Returns the underlying socket if bound, or `null`/`undefined` otherwise.

```typescript
isConnected(): dgram.Socket | null | undefined
```

##### `getClient()`

```typescript
getClient(): dgram.Socket | null | undefined
```

##### `handleConnected()` / `handleData(opts)` / `handleClosed()` / `handleError(opts)`

Default handlers used when the matching `onConnected`/`onData`/`onClosed`/`onError` option is omitted:

| Handler | Log level | Logged context |
|---------|-----------|-----------------|
| `handleConnected` | `info` | `host`, `port`, `multicastAddress` |
| `handleClosed` | `info` | `host`, `port`, `multicastAddress` |
| `handleData` | `info` | `host`, `port` only - no `multicastAddress` |
| `handleError` | `error` | `host`, `port` only - no `multicastAddress` |

```typescript
handleConnected(): void
handleData(opts: { identifier: string; message: string | Buffer; remoteInfo: dgram.RemoteInfo }): void
handleClosed(): void
handleError(opts: { identifier: string; error: Error }): void
```

---

## Types Reference

### TFetcherVariant / TFetcherResponse / TFetcherWorker

```typescript
type TFetcherVariant = TConstValue<typeof FetcherVariants>; // 'native' | 'axios'

type TFetcherResponse<T extends TFetcherVariant> =
  T extends 'native' ? Response : AxiosResponse<unknown>;

type TFetcherWorker<T extends TFetcherVariant> =
  T extends 'axios' ? AxiosInstance : typeof fetch;
```

### THttpMethod

```typescript
type THttpMethod = ValueOf<typeof HTTP.Methods> | Uppercase<ValueOf<typeof HTTP.Methods>>;
// 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'query'
// | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'QUERY'
```

### ITcpSocketServerOptions

```typescript
interface ITcpSocketServerOptions<
  SocketServerOptions extends ServerOpts = ServerOpts,
  SocketServerType extends SocketServer = SocketServer,
  SocketClientType extends SocketClient = SocketClient,
> {
  scope?: string;
  identifier: string;

  serverOptions: Partial<SocketServerOptions>;
  listenOptions: Partial<ListenOptions>;
  authenticateOptions: { required: boolean; duration?: number };

  extraEvents?: Record<
    string,
    (opts: { id: string; socket: SocketClientType; args: unknown }) => ValueOrPromise<void>
  >;

  createServerFn: (
    options: Partial<SocketServerOptions>,
    connectionListener: (socket: SocketClientType) => void,
  ) => SocketServerType;

  onServerReady?: (opts: { server: SocketServerType }) => void;
  onClientConnected?: (opts: { id: string; socket: SocketClientType }) => void;
  onClientData?: (opts: { id: string; socket: SocketClientType; data: Buffer | string }) => void;
  onClientClose?: (opts: { id: string; socket: SocketClientType }) => void;
  onClientError?: (opts: { id: string; socket: SocketClientType; error: Error }) => void;
  onServerError?: (opts: { server: SocketServerType; error: Error }) => void;
}
```

`onServerError` fires when the underlying `net`/`tls` server emits `'error'` - for example `EADDRINUSE` from a port already in use. Without this listener, the event is unhandled and takes the whole process down with it.

### INetworkTcpClientProps

```typescript
interface INetworkTcpClientProps<
  SocketClientOptions extends PlainConnectionOptions | TlsConnectionOptions,
  SocketClientType extends PlainSocketClient | TlsSocketClient,
> {
  identifier: string;
  scope?: string;
  options: SocketClientOptions;
  reconnect?: boolean;
  maxRetry?: number;
  encoding?: BufferEncoding;
  createClientFn: (
    options: SocketClientOptions,
    connectionListener?: () => void,
  ) => SocketClientType;
  onConnected?: (opts: { client: SocketClientType }) => ValueOrPromise<void>;
  onData?: (opts: { identifier: string; message: string | Buffer }) => ValueOrPromise<void>;
  onClosed?: (opts: { client: SocketClientType }) => void;
  onError?: (error: unknown) => void;
}
```

### INetworkUdpClientProps

```typescript
interface INetworkUdpClientProps {
  identifier: string;
  host?: string;
  port: number;
  reuseAddr?: boolean;
  multicastAddress?: {
    groups?: Array<string>;
    interface?: string;
  };
  onConnected?: (opts: { identifier: string; host?: string; port: number }) => void;
  onData?: (opts: {
    identifier: string;
    message: string | Buffer;
    remoteInfo: dgram.RemoteInfo;
  }) => void;
  onClosed?: (opts: { identifier: string; host?: string; port: number }) => void;
  onError?: (opts: { identifier: string; host?: string; port: number; error: Error }) => void;
  onBind?: (opts: {
    identifier: string;
    socket: dgram.Socket;
    host?: string;
    port: number;
    reuseAddr?: boolean;
    multicastAddress?: { groups?: Array<string>; interface?: string };
  }) => ValueOrPromise<void>;
}
```

---

## URL Safety

The guard for a url your application did not choose - a webhook target, an avatar link, an import source. Without it a request can be steered at `169.254.169.254` and the cloud credentials behind it.

It ships as part of the network module, so the root barrel carries it:

```typescript
import { UrlPolicy, UrlIngest, UrlGuard, UrlSchemes, UrlSafetyDefaults } from '@venizia/ignis-helpers';
import type { IUrlSafetyPolicy, TTrustedOrigin } from '@venizia/ignis-helpers';
import { UrlFetchError } from '@venizia/ignis-helpers';
```

### Two halves, split on purpose

| Class | Needs | Decides |
|---|---|---|
| `UrlPolicy` | nothing but string and number work | The shape of a url: scheme, trusted origins, and a literal IP address |
| `UrlIngest` | `node:dns` | What a hostname resolves to |
| `UrlGuard` | `UrlIngest` | The per-call vetting a fetcher runs: resolve, check every address, pin, re-check each redirect hop |

`UrlPolicy` is re-exported from the browser-pure `@venizia/ignis-helpers/core` subpath. It never imports `ingest.ts`, and `make purity` fails the build if that changes. `UrlIngest` stays out of `/core`.

The split has a consequence you must know: a hostname that **resolves** to a private address passes `UrlPolicy` on purpose. Only `UrlIngest` and `UrlGuard` catch that. Call `UrlPolicy` alone only where DNS does not exist.

### IUrlSafetyPolicy

Passed as `guard` on a fetcher call or in the fetcher's `defaults`. Every field is per call. An application that must reach plain `http` on one route says so at that call site, rather than weakening a constant for everyone.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `allowedSchemes` | `string[]` | `['https:']` | The schemes a guarded call will speak. `file:` and `gopher:` are the classic pivots, and neither is reachable |
| `allowPrivateAddress` | `boolean` | `false` | Turning it on in a path that takes user input re-opens the hole this guard exists to close |
| `hosts` | `{ trusted: TTrustedOrigin[]; strict?: boolean }` | - | Origins you trust, and whether to trust nothing else (see [Trusted origins](#trusted-origins)) |
| `maxRedirects` | `number` | `3` | Hops allowed. Each one is re-checked. `0` returns the 3xx as a `UrlFetchError` |
| `timeout` | `IDuration` | 10 seconds | A slow host holds a worker slot for exactly this long |
| `maxBytes` | `number` | `10485760` (10 MB) | The read stops and cancels the moment the body crosses it |
| `proxy` | `string` | - | `http://host:port` of a proxy the guarded request goes through |

`proxy`: the address check still runs, but the connection is NOT pinned, because the proxy resolves the name. The environment proxy is never used.

`timeout` takes an `IDuration`, not a number of milliseconds. `UrlSafetyDefaults` holds the raw values: `ALLOWED_SCHEMES`, `ALLOW_PRIVATE_ADDRESS`, `MAX_REDIRECTS`, `TIMEOUT_MILLISECONDS`, `MAX_BYTES`. `UrlSchemes` holds `HTTP` (`'http:'`) and `HTTPS` (`'https:'`), with the trailing colon that `URL.protocol` returns.

### UrlPolicy

| Method | Signature | Does |
|---|---|---|
| `assertSafeUrl` | `(opts: { url: string; policy?: IUrlSafetyPolicy }): URL` | Parses and checks the url. Returns the parsed `URL`, or throws |
| `resolveTrustedOrigins` | `(opts: { scope: string; trusted?: unknown; label?: string }): ReadonlySet<string>` | Validates a list of trusted origins and returns it as a set; throws a configuration error naming the bad entry |
| `isMetadataAddress` | `(opts: { address: string }): boolean` | `true` for a cloud metadata address (`169.254.0.0/16`, `100.100.100.200`, `fd00:ec2::254`, `fe80::/10`) |
| `isLoopbackHost` | `(opts: { hostname: string }): boolean` | `true` for `localhost`, `127.0.0.0/8` and `::1`, as the URL parser writes them |
| `isNonPublicAddress` | `(opts: { address: string }): boolean` | `true` for any address an untrusted url must never reach. Takes an IP literal only: a domain name answers `true` |
| `readHostAddress` | `(opts: { hostname: string }): string` | Strips the brackets off an IPv6 literal - `[::1]` becomes `::1` |

`assertSafeUrl` checks, in this order: a malformed url (refused); a url that carries a username or a password (always, no policy flag; an empty `https://@host/` has none and passes); the policy's `hosts` (a leftover `allowedHosts` or an invalid trusted entry throws a configuration error); a trusted origin, which returns here; `hosts.strict`, which refuses any other origin; a scheme outside `allowedSchemes`; and a literal address that is not public.

`isNonPublicAddress` fails closed. An address it cannot parse counts as non-public, because a guard that fails open on a string it does not understand is not a guard. It covers loopback, the private v4 ranges, carrier-grade NAT, link-local (`169.254.0.0/16`, the metadata address), benchmarking, multicast, and the v6 equivalents. It also unwraps both spellings of an IPv4-mapped v6 address, because `new URL` rewrites `::ffff:169.254.169.254` into the hex form and a dotted-quad check alone would read green.

An IPv6 literal is expanded to its eight 16-bit groups before it is classified, so `::1`, `0:0:0:0:0:0:0:1` and `0000:0000:0000:0000:0000:0000:0000:0001` get one answer. An address that carries an IPv4 one is judged by the IPv4 rules: v4-mapped (`::ffff:0:0/96`), v4-compatible (`::a.b.c.d`), NAT64 (`64:ff9b::/96`, so `64:ff9b::a9fe:a9fe` is the metadata address) and 6to4 (`2002::/16`). Multicast (`ff00::/8`), site-local (`fec0::/10`), documentation (`2001:db8::/32`, `3fff::/20`), the IETF protocol assignments `2001::/23` (Teredo among them), discard (`100::/64`), SRv6 (`5f00::/16`), the rest of `64:ff9b::/32` and the reserved `::/8` are non-public. IPv4 text must be canonical dotted decimal: `0177.0.0.1` (octal to some parsers) and `1e2.0.0.1` answer `true`. A url is canonicalised by `new URL` first, so this matters to a caller that passes a raw string. A string longer than 45 characters is not an IPv6 address and answers `true` at once.

### UrlIngest

| Method | Signature | Does |
|---|---|---|
| `assertPublicHost` | `(opts: { hostname: string; policy? }): Promise<void>` | Resolves the host and rejects if **any** address is non-public |
| `assertReachableUrl` | `(opts: { url: string; policy? }): Promise<URL>` | Both halves, in the order they must run: shape, then network |
| `resolvePublicAddresses` | `(opts: { hostname: string; trusted?; policy?; signal? }): Promise<string[]>` | The vetted addresses of a host |

`assertPublicHost` checks every resolved address, not the first. A host can publish one public A record beside an internal one. Called on their own, these only check: the address can change before your own connect, so send through a fetcher with `guard`.

`fetchGuarded`, `readCappedBody` and `capStream` of `UrlIngest` were removed: the fetchers do that work now, and `BodyLimit` holds the body cap.

### Guarded fetching

Pass `guard` to a call, or set it in the fetcher's `defaults`, and give the fetcher the engine:

```typescript
import { NativeFetcher, UrlGuard } from '@venizia/ignis-helpers';

const fetcher = new NativeFetcher({ name: 'webhooks', guardEngine: UrlGuard });

const response = await fetcher.post({
  url: customerWebhookUrl,
  body: event,
  headers: { 'x-signature': signature },
  guard: { maxRedirects: 0 },
  maxBytes: 2 * 1024 * 1024,
  timeout: 5000,
  retry: { maxAttempts: 3 },
});
```

Per attempt the guard resolves the host, checks every answer, and the request connects to those addresses and no other, so a DNS answer that changes after the check (DNS rebinding) is never looked up again. The `Host` header and, for https, the TLS server name stay the url's own: the certificate is still verified for the name you asked for. A `Host` in `headers` is ignored.

Redirects are walked by hand, so every hop is checked and pinned again. A 301 or 302 on a POST, and a 303, become a GET without the body. A 307 or 308 repeats the request; with a body it is refused when it leaves the origin, so a signed payload is never replayed to a host a redirect chose. When a hop changes origin, every caller header is dropped except `accept`, `accept-language` and `user-agent`. Running out of hops is the "Too many redirects" refusal. A request that may already have reached the server (a reset after the body went out) is not repeated on the next vetted address unless it is a GET or HEAD, so a webhook is not delivered twice; a refused connection does move on.

`timeout` is per attempt; `retry.maxTotalMs` is the total budget. A guard in `defaults` can be replaced by a call's own policy, never removed. A call with `guard` and no `guardEngine` fails with an error that says what to pass, and sends nothing.

Both fetchers can guard. The Axios fetcher connects through a per-exchange agent whose `lookup` answers only the vetted addresses; an option outside the allowlist is refused with a guard, and so is `guard.proxy` (use `NativeFetcher`). A guarded call always caps the body it reads: `maxBytes` defaults to the policy's 10 MB.

To store what comes back without buffering it, `fetcher.get({ url, guard, maxBytes })` returns a response whose body fails the moment it crosses `maxBytes`; pipe `response.body` onward.

> [!WARNING]
> `policy.proxy` sends the request through a proxy you chose, which resolves the name itself: the address check still runs, the connection is not pinned. The environment's `HTTP_PROXY` / `HTTPS_PROXY` is ignored on a pinned connection, so it cannot undo the pin.

### Trusted origins

`hosts` names the origins your application trusts. It is the one setting for "this internal service is allowed" and for "nothing but these".

```typescript
// An internal service, reached on purpose. Every other url keeps the full guard.
await fetcher.get({
  url: 'http://vault.corp.local:8200/v1/secret',
  guard: { hosts: { trusted: ['http://vault.corp.local:8200'] } },
});

// Only the CDN, nothing else.
const policy = { hosts: { trusted: ['https://cdn.example.com' as const], strict: true } };
```

- **Exact origins.** An entry is scheme, host and a non-default port, written as `new URL(entry).origin` writes it. Another port, scheme or host is another origin.
- **Passes whatever it resolves to.** A trusted origin is reached even when it resolves to a private address. The request still connects to the addresses that were checked.
- **Trust is entered only through a trusted hop.** A trusted origin passes as a private target when the first url is trusted, or when every hop before it was trusted (trusted to trusted). Once a hop is not trusted, every later hop gets the full guard: a public url cannot redirect into a trusted internal origin, and a trusted metadata literal is not reachable that way. Each hop is judged again and pinned to the addresses that were checked; a redirect from a trusted origin to an untrusted private address is refused on that hop.
- **`strict: true`.** Only trusted origins pass; a public origin that is not listed is refused before any request. It needs at least one trusted origin.
- **`allowedSchemes`.** Applies to urls that are not trusted. A trusted origin carries its own scheme.
- **Metadata addresses.** `169.254.169.254` and its kin open only when the trusted origin's host IS that IP literal. A trusted host name that resolves to one is refused.
- **Credentials.** A url with a username or a password is refused even on a trusted origin.

An entry that is not exactly an origin - a path, a trailing slash, credentials, upper case, a default port (`:443`), a wildcard, an odd IP spelling such as `http://2130706433` - throws a configuration error naming the entry. It is never ignored.

`allowedHosts` was removed. A policy that still carries it throws, because dropping it would widen "only these hosts" to "any public host".

### A typed error for an answer you did not get

Any status outside 2xx, and a redirect that was not followed, raise a `UrlFetchError<RS>` (`RS` is the raw response type):

| Field | Meaning |
|---|---|
| `status` | The status the upstream answered with |
| `url` | The url you asked for |
| `headers` | The response headers |
| `response` | The upstream's answer. Its body is already cancelled, so read the status and headers only |
| `location` | The raw `Location` header of a redirect, when it had one |

`statusCode` (the status this server answers with) stays 400. `UrlFetchError.is(error)` narrows an error.

```typescript
try {
  await fetcher.get({ url, guard: { maxRedirects: 0 } });
} catch (error) {
  if (UrlFetchError.is(error) && error.status === 302) {
    return error.location; // the redirect target, for you to judge
  }

  if (UrlFetchError.is(error) && error.status === 404) {
    return null;
  }

  throw error;
}
```

With `maxRedirects: 0` the first 3xx is that error and nothing is followed. A `Location` that is not a url raises it too, instead of a bare `TypeError`. With a positive `maxRedirects`, running out of hops is still the "Too many redirects" refusal.

### Cancelling a request

`signal` joins the one deadline: an abort by the caller rejects with the caller's own reason (`signal.reason`, an `AbortError` by default), the deadline with a `TimeoutError`. Tell them apart by `error.name`, or by `signal.aborted`. An already aborted signal rejects before any lookup.

```typescript
const controller = new AbortController();
const response = await fetcher.get({ url, guard: policy, signal: controller.signal });
```

### Telling a refusal from a retryable failure

Every refusal carries the same code, `core.url_safety.url_refused`, from the `UrlSafetyErrors.URL_REFUSED` definition. `UrlPolicy.isRefusedError({ error })` tests it.

A refused url is refused forever. A bad scheme, a non-public address, an origin outside a strict trusted list, a malformed url, too many hops, an oversized body - retrying any of those repeats the same rejection and turns your retry loop into a repeat scanner. Drop the work instead.

A timeout, a DNS failure, or a 5xx answers `false`. Those are worth another attempt, and the fetcher raises them without a refusal code (a 4xx or 5xx as a [`UrlFetchError`](#a-typed-error-for-an-answer-you-did-not-get)). The fetcher's own `retry` already applies this rule: it never retries a guard refusal.

```typescript
await fetcher.get({ url: userSuppliedUrl, guard: {}, retry: { maxAttempts: 3 } });
```

## See also

- [Network overview](/extensions/helpers/network/) - introduction and the most common tasks
