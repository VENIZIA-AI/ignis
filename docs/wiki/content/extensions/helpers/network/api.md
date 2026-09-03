---
title: Network - Full Reference
description: Complete reference for every network helper class - HTTP fetchers, TCP/TLS socket client and server, UDP client - and every option and type
difficulty: intermediate
---

# Network - Full Reference

Exhaustive reference for `BaseNetworkRequest` and its fetchers, the TCP/TLS client-server hierarchy, `NetworkUdpClient`, and every option type. For a readable introduction and the most common tasks, start with the [Network overview](/extensions/helpers/network/).

## Find what you need

| You're looking for | Go to |
|---|---|
| The HTTP client base class and URL helpers | [BaseNetworkRequest](#basenetworkrequest) |
| Axios-backed HTTP client | [AxiosFetcher](#axiosfetcher) / [AxiosNetworkRequest](#axiosnetworkrequest) |
| Native-`fetch`-backed HTTP client | [NodeFetcher](#nodefetcher) / [NodeFetchNetworkRequest](#nodefetchnetworkrequest) |
| Why the `QUERY` method must reach the wire uppercase | [HTTP.Methods](#http-methods) |
| Secret redaction in request logs | [Request Logging and Redaction](#request-logging-and-redaction) |
| Plain TCP or TLS server, client tracking, authentication | [BaseNetworkTcpServer](#basenetworktcpserver) |
| Plain TCP or TLS client, auto-reconnect behavior | [BaseNetworkTcpClient](#basenetworktcpclient) |
| UDP client and multicast | [NetworkUdpClient](#networkudpclient) |
| Every option and type in one place | [Types Reference](#types-reference) |

**Files:**

- [`packages/helpers/src/modules/network/http-request/base-network-request.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/base-network-request.helper.ts) - `BaseNetworkRequest`
- [`packages/helpers/src/modules/network/http-request/fetcher/base-fetcher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/fetcher/base-fetcher.ts) - `IFetchable`, `IRequestOptions`, `AbstractNetworkFetchableHelper`
- [`packages/helpers/src/modules/network/http-request/fetcher/node-fetcher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/fetcher/node-fetcher.ts) - `NodeFetcher`, `NodeFetchNetworkRequest`
- [`packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts) - `AxiosFetcher`, `AxiosNetworkRequest` (`@venizia/ignis-helpers/axios` sub-path)
- [`packages/helpers/src/modules/network/http-request/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/types.ts) - `TFetcherVariant`, `TFetcherResponse`, `TFetcherWorker`
- [`packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts) - `BaseNetworkTcpServer`, `ITcpSocketClient`, `ITcpSocketServerOptions`
- [`packages/helpers/src/modules/network/tcp-socket/base-tcp-client.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/base-tcp-client.helper.ts) - `BaseNetworkTcpClient`, `INetworkTcpClientProps`
- [`packages/helpers/src/modules/network/tcp-socket/network-tcp-server.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/network-tcp-server.helper.ts) - `NetworkTcpServer`
- [`packages/helpers/src/modules/network/tcp-socket/network-tcp-client.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/network-tcp-client.helper.ts) - `NetworkTcpClient`
- [`packages/helpers/src/modules/network/tcp-socket/network-tls-tcp-server.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/network-tls-tcp-server.helper.ts) - `NetworkTlsTcpServer`
- [`packages/helpers/src/modules/network/tcp-socket/network-tls-tcp-client.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/network-tls-tcp-client.helper.ts) - `NetworkTlsTcpClient`
- [`packages/helpers/src/modules/network/udp-socket/network-udp-client.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/udp-socket/network-udp-client.helper.ts) - `NetworkUdpClient`, `INetworkUdpClientProps`
- [`packages/helpers/src/common/redact.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/redact.ts) - `redactSecrets`, `redactUrlCredentials`
- [`packages/helpers/src/common/constants/http.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/http.ts) - `HTTP.Methods`, `THttpMethod`

## Architecture

```
BaseHelper
  ├── BaseNetworkRequest<T extends TFetcherVariant>
  │     ├── AxiosNetworkRequest        (T = 'axios')
  │     └── NodeFetchNetworkRequest    (T = 'node-fetch')
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
  └── NodeFetcher                      (V = 'node-fetch')
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
| `baseUrl` | `string` | Overrides the instance's base URL. Falls back to `this.baseUrl`. An explicit empty string does **not** fall back - it throws |
| `paths` | `string[]` | Path segments to append. Each is prefixed with `/` if missing |

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
  send(opts: RQ, logger?: any): Promise<RS>;
  get(opts: RQ, logger?: any): Promise<RS>;
  post(opts: RQ, logger?: any): Promise<RS>;
  put(opts: RQ, logger?: any): Promise<RS>;
  patch(opts: RQ, logger?: any): Promise<RS>;
  delete(opts: RQ, logger?: any): Promise<RS>;
  query(opts: RQ, logger?: any): Promise<RS>;

  getWorker(): TFetcherWorker<V>;
}
```

All HTTP method shortcuts (`get`, `post`, `put`, `patch`, `delete`, `query`) delegate to `send()` with the `method` field set accordingly. `query` sends the HTTP `QUERY` method ([RFC 9110/10008](https://www.ietf.org/archive/id/draft-ietf-httpbis-safe-method-w-body-10.html)). It behaves like `GET` but carries a body - useful for search payloads too large to fit a query string.

### IRequestOptions

```typescript
interface IRequestOptions {
  url: string;
  method?: THttpMethod;
  params?: AnyObject;
  timeout?: number;
  [extra: symbol | string]: any;
}
```

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
> - **This is not cosmetic.** Node's undici is the `fetch` implementation on Node - not Bun - and it auto-normalizes only some methods:
>
>   | Auto-normalized by undici | Sent through verbatim |
>   |---|---|
>   | `DELETE`, `GET`, `HEAD`, `OPTIONS`, `POST`, `PUT` | `PATCH`, `QUERY` |
>
>   A lowercase `patch` or `query` reaches the server unchanged, and most servers reject it.
> - **Bun and Axios hide the bug.** Bun's `fetch` and Axios both uppercase every method themselves - Axios via `node:http`. The bug surfaces only once the app runs on Node with undici.

---

### AbstractNetworkFetchableHelper

```typescript
abstract class AbstractNetworkFetchableHelper<
  V extends TFetcherVariant,
  RQ extends IRequestOptions,
  RS extends TFetcherResponse<V>,
> implements IFetchable<V, RQ, RS>
```

Abstract base for fetcher implementations. Provides convenience HTTP method wrappers and protocol detection. Does **not** extend `BaseHelper` - it has no `this.logger`.

#### Constructor

```typescript
constructor(opts: { name: string; variant: V })
```

#### Methods

##### `abstract send(opts, logger?)`

Subclasses must implement the actual request dispatch.

```typescript
abstract send(opts: RQ, logger?: any): Promise<RS>;
```

##### `get(opts, logger?)` / `post(opts, logger?)` / `put(opts, logger?)` / `patch(opts, logger?)` / `delete(opts, logger?)` / `query(opts, logger?)`

```typescript
get(opts: RQ, logger?: any): Promise<RS>
post(opts: RQ, logger?: any): Promise<RS>
put(opts: RQ, logger?: any): Promise<RS>
patch(opts: RQ, logger?: any): Promise<RS>
delete(opts: RQ, logger?: any): Promise<RS>
query(opts: RQ, logger?: any): Promise<RS>
```

Each calls `send()` with `method` set to the matching `HTTP.Methods` token (`get` → `HTTP.Methods.GET`, ... `query` → `HTTP.Methods.QUERY`). Any other field on `opts` (`body`, `headers`, `params`, ...) passes through untouched.

##### `getProtocol(url)`

Returns `HTTP.Protocols.HTTP` (`'http'`) if `url` starts with `'http:'`, otherwise `HTTP.Protocols.HTTPS` (`'https'`).

```typescript
getProtocol(url: string): 'http' | 'https'
```

##### `getWorker()`

Returns the underlying HTTP client instance (set by the concrete fetcher's constructor).

```typescript
getWorker(): TFetcherWorker<V>
```

---

### AxiosFetcher

```typescript
class AxiosFetcher extends AbstractNetworkFetchableHelper<
  'axios',
  IAxiosRequestOptions,
  AxiosResponse['data']
>
```

Axios-based fetcher implementation. Creates an `axios` instance with the provided default configuration.

#### Constructor

```typescript
constructor(opts: {
  name: string;
  defaultConfigs: AxiosRequestConfig;
  logger?: any;
})
```

`opts.logger`, if provided, logs `'Creating new network request worker instance! Name: %s'` once at construction time. This is unrelated to the per-call `logger` argument on `send()`.

#### IAxiosRequestOptions

```typescript
interface IAxiosRequestOptions extends AxiosRequestConfig, IRequestOptions {
  url: string;
  method?: THttpMethod;
  params?: AnyObject;
  body?: AnyObject;       // Mapped to Axios `data`
  headers?: AnyObject;
}
```

> [!NOTE]
> - **`body` maps to Axios's `data`** field internally.
> - **Query `params` are serialized** using `node:querystring` via Axios's `paramsSerializer`.
> - **HTTPS gets an `https.Agent` automatically.** Certificate verification is ON, and connections are kept alive. Pass `rejectUnauthorized: false` - on the fetcher, for the whole instance, or on a single request - only when you genuinely mean to accept an unverified certificate. A caller-supplied `httpsAgent` always wins, so a custom CA, pinning or mTLS agent is honoured as given.

#### Methods

##### `send(opts, logger?)`

```typescript
override send<T = any>(opts: IAxiosRequestOptions, logger?: any): Promise<AxiosResponse<T>>
```

Dispatches the request via the internal `axios` instance.

- `method` defaults to `HTTP.Methods.GET` and is uppercased before dispatch.
- HTTPS URLs automatically get an `https.Agent` configured.
- If `logger` is passed, logs `'URL: %s | Props: %s'` at `info` level with the assembled request config run through `redactSecrets()`.

---

### AxiosNetworkRequest

```typescript
class AxiosNetworkRequest extends BaseNetworkRequest<'axios'>
```

Pre-configured HTTP client using Axios. Import only from the sub-path - `import { AxiosNetworkRequest } from '@venizia/ignis-helpers/axios'`.

#### Constructor

```typescript
constructor(opts: IAxiosNetworkRequestOptions)
```

```typescript
interface IAxiosNetworkRequestOptions {
  name: string;
  networkOptions: Omit<AxiosRequestConfig, 'baseURL'> & {
    baseUrl?: string;
  };
}
```

**Default configuration applied:**

| Setting | Default |
|---------|---------|
| `headers['content-type']` | `'application/json; charset=utf-8'` |
| `withCredentials` | `true` |
| `validateStatus` | `(status) => status < 500` |
| `timeout` | `60000` (1 minute) |

User-provided values in `networkOptions` override all defaults. `networkOptions.baseUrl` maps to Axios's `baseURL`.

---

### NodeFetcher

```typescript
class NodeFetcher extends AbstractNetworkFetchableHelper<
  'node-fetch',
  INodeFetchRequestOptions,
  Awaited<ReturnType<typeof fetch>>
>
```

Native `fetch`-based fetcher implementation.

#### Constructor

```typescript
constructor(opts: {
  name: string;
  defaultConfigs: RequestInit;
  logger?: any;
})
```

#### INodeFetchRequestOptions

```typescript
interface INodeFetchRequestOptions extends RequestInit, IRequestOptions {
  url: string;
  method?: THttpMethod;
  params?: AnyObject;
}
```

#### Methods

##### `send(opts, logger?)`

```typescript
override async send(opts: INodeFetchRequestOptions, logger?: any): Promise<Response>
```

Dispatches the request using the native `fetch` API. Behavior:

- `method` defaults to `HTTP.Methods.GET` and is uppercased before dispatch.
- Query `params` are serialized with `node:querystring` and appended to `url`. The separator adapts: `?` when the URL carries no query string yet, `&` when it already does - never a double `?`.
- If `timeout` is provided, an internal `AbortController` aborts the request after that many milliseconds.
  - The internal timeout signal is **composed**, never substituted, with a caller-supplied `signal`. When both are present, IGNIS builds `AbortSignal.any([signal, timeoutController.signal])`. That way a caller aborting its own signal still cancels the request, even while a timeout is also armed.
  - The timer is cleared as soon as the request settles.
- If `logger` is passed, logs `'URL: %s | Props: %s | Timeout: %s'` at `info` level with the request config run through `redactSecrets()`.

---

### NodeFetchNetworkRequest

```typescript
class NodeFetchNetworkRequest extends BaseNetworkRequest<'node-fetch'>
```

Pre-configured HTTP client using native `fetch`. Exported from the root barrel - no extra dependency.

#### Constructor

```typescript
constructor(opts: INodeFetchNetworkRequestOptions)
```

```typescript
interface INodeFetchNetworkRequestOptions {
  name: string;
  networkOptions: RequestInit & {
    baseUrl?: string;
  };
}
```

**Default configuration applied:**

| Setting | Default |
|---------|---------|
| `headers['content-type']` | `'application/json; charset=utf-8'` |

If `headers` is a `Headers` instance, it is converted to a plain object via `Object.fromEntries(headers.entries())` before merging with the default.

> [!WARNING] `timeout` is per-call, not per-instance
> `networkOptions` is `RequestInit`, which has no `timeout` field. Passing one there has no effect on request cancellation. `NodeFetcher.send()` only reads `timeout` from the arguments of each individual `send()`/`get()`/... call. Pass it every time you need an abort:
>
> ```typescript
> await this.getNetworkService().send({ url: '/slow-endpoint', method: 'get', timeout: 5000 });
> ```

---

### Request Logging and Redaction

Neither fetcher logs anything by default. `send()` and every shortcut accept an **optional** `logger` as the second argument, guarded internally with `logger?.for(...)`. Pass a logger to get an `info`-level line per request - typically `this.logger`, whether the caller is a `BaseHelper` subclass or extends `BaseNetworkRequest` directly:

```typescript
await this.getNetworkService().post({ url, body }, this.logger);
```

Whenever a logger is passed, IGNIS runs the assembled request config through `redactSecrets()` before the log line is written. That covers `url`, `method`, `headers`, `body`/`data`, and any other option. Redaction matches by key name, case-insensitively, at any depth, against `SECRET_KEY_PATTERN`:

| Key group | Matched spellings |
|-----------|--------------------|
| Options-object (camelCase) | `pass`, `password`, `passphrase`, `secret`, `token`, `apiKey`, `accessKey`, `secretKey`, `privateKey`, `key`, `cert`, `ca`, `pfx`, `credentials`, `authorization`, `auth`, `jwtSecret`, `applicationSecret`, `connectionString` |
| Options-object (snake_case) | `api_key`, `access_key`, `secret_key`, `private_key` |
| HTTP header spellings | `cookie`, `set-cookie`, `proxy-authorization`, `www-authenticate`, and any `(x-)?(api\|auth\|access\|secret\|session\|csrf\|xsrf)-(key\|token\|secret\|id)` pattern (e.g. `x-api-key`, `x-auth-token`, `x-csrf-token`) |

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

- Assigns a unique ID via `getUID()`.
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
| `'authenticated'` | Sets `storage.authenticatedAt`; clears the pending kick-timer |
| `'unauthorized'` / `'authenticating'` | Clears `storage.authenticatedAt` |

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
    connectedAt: dayjs.Dayjs;
    authenticatedAt: dayjs.Dayjs | null;
    authenticateTimeout?: ReturnType<typeof setTimeout> | null;
    [additionField: symbol | string]: any;
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

Returns `redactSecrets(this.options)`. A TLS client's `options` **is** its private key material - `key`/`cert`/`passphrase`. Every internal log call uses this method instead of logging `this.options` directly, or the key would be written to every log file and aggregator downstream.

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
handleError(error: any): void                                             // Logs; schedules a reconnect if eligible
```

**Reconnect gate on `handleError`:**

| Condition | Result |
|-----------|--------|
| `reconnect` is `false` | No reconnect - the first guard returns immediately |
| `retry.currentReconnect >= retry.maxReconnect` | No reconnect - the first guard returns immediately |
| `maxReconnect === -1` | **No reconnect, ever.** `currentReconnect` starts at `0`, and `0 >= -1` is already true, so the first guard returns before any attempt is made |
| `reconnect` is `true` and `currentReconnect < maxReconnect` (with `maxReconnect >= 0`) | Reconnect scheduled |

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
type TFetcherVariant = 'node-fetch' | 'axios';

type TFetcherResponse<T extends TFetcherVariant> =
  T extends 'node-fetch' ? Response : AxiosResponse;

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
    (opts: { id: string; socket: SocketClientType; args: any }) => ValueOrPromise<void>
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
  onError?: (error: any) => void;
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

## See also

- [Network overview](/extensions/helpers/network/) - introduction and the most common tasks
