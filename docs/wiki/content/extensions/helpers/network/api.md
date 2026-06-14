# Network -- API Reference

## Architecture

```
BaseHelper
  ├── BaseNetworkRequest<T extends TFetcherVariant>
  │     ├── AxiosNetworkRequest        (T = 'axios')
  │     └── NodeFetchNetworkRequest    (T = 'node-fetch')
  │
  ├── BaseNetworkTcpServer<ServerOpts, ServerType, ClientType>
  │     ├── NetworkTcpServer           (net.Server, net.Socket)
  │     └── NetworkTlsTcpServer        (tls.Server, tls.TLSSocket)
  │
  ├── BaseNetworkTcpClient<ClientOpts, ClientType>
  │     ├── NetworkTcpClient           (net.TcpSocketConnectOpts, net.Socket)
  │     └── NetworkTlsTcpClient        (tls.ConnectionOptions, tls.TLSSocket)
  │
  └── NetworkUdpClient

AbstractNetworkFetchableHelper<V, RQ, RS>  (implements IFetchable)
  ├── AxiosFetcher                     (V = 'axios')
  └── NodeFetcher                      (V = 'node-fetch')
```

All classes that extend `BaseHelper` inherit scoped logging via `this.logger`.

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
| `baseUrl` | `string` | Overrides the instance's base URL. Falls back to `this.baseUrl` |
| `paths` | `string[]` | Path segments to append. Each is prefixed with `/` if missing |

**Throws:** `Error` with message `'[getRequestUrl] Invalid configuration for third party request base url!'` when both `opts.baseUrl` and `this.baseUrl` are empty.

**Example:**

```typescript
client.getRequestUrl({ paths: ['v1', 'users', '123'] });
// => 'https://api.example.com/v1/users/123'

client.getRequestUrl({ baseUrl: 'https://other.api.com', paths: ['health'] });
// => 'https://other.api.com/health'
```

##### `getRequestPath(opts)`

Joins path segments, ensuring each starts with `/`.

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

Returns the raw HTTP client from the fetcher (`AxiosInstance` for Axios, `typeof fetch` for Node Fetch).

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
  getWorker(): TFetcherWorker<V>;
}
```

All HTTP method shortcuts (`get`, `post`, `put`, `patch`, `delete`) delegate to `send()` with the `method` field set accordingly.

### IRequestOptions

```typescript
interface IRequestOptions {
  url: string;
  params?: Record<string | symbol, any>;
  method?: string;
  timeout?: number;
  [extra: symbol | string]: any;
}
```

---

### AbstractNetworkFetchableHelper

```typescript
abstract class AbstractNetworkFetchableHelper<
  V extends TFetcherVariant,
  RQ extends IRequestOptions,
  RS extends TFetcherResponse<V>,
> implements IFetchable<V, RQ, RS>
```

Abstract base for fetcher implementations. Provides convenience HTTP method wrappers and protocol detection.

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

##### `get(opts, logger?)`

```typescript
get(opts: RQ, logger?: any): Promise<RS>
```

Calls `send()` with `method: 'get'`.

##### `post(opts, logger?)`

```typescript
post(opts: RQ, logger?: any): Promise<RS>
```

Calls `send()` with `method: 'post'`.

##### `put(opts, logger?)`

```typescript
put(opts: RQ, logger?: any): Promise<RS>
```

Calls `send()` with `method: 'put'`.

##### `patch(opts, logger?)`

```typescript
patch(opts: RQ, logger?: any): Promise<RS>
```

Calls `send()` with `method: 'patch'`.

##### `delete(opts, logger?)`

```typescript
delete(opts: RQ, logger?: any): Promise<RS>
```

Calls `send()` with `method: 'delete'`.

##### `getProtocol(url)`

Returns `'http'` or `'https'` based on the URL prefix.

```typescript
getProtocol(url: string): 'http' | 'https'
```

##### `getWorker()`

Returns the underlying HTTP client instance.

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

#### IAxiosRequestOptions

```typescript
interface IAxiosRequestOptions extends AxiosRequestConfig, IRequestOptions {
  url: string;
  method?: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options';
  params?: AnyObject;
  body?: AnyObject;       // Mapped to Axios `data`
  headers?: AnyObject;
}
```

> [!NOTE]
> The `body` field is mapped to Axios's `data` field internally. Query parameters are serialized using `node:querystring`. For HTTPS URLs, an `https.Agent` is automatically created with `rejectUnauthorized` defaulting to `false`.

#### Methods

##### `send(opts, logger?)`

```typescript
override send<T = any>(opts: IAxiosRequestOptions, logger?: any): Promise<AxiosResponse<T>>
```

Dispatches the request via the internal `axios` instance. For HTTPS URLs, automatically configures an `https.Agent`.

---

### AxiosNetworkRequest

```typescript
class AxiosNetworkRequest extends BaseNetworkRequest<'axios'>
```

Pre-configured HTTP client using Axios.

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

User-provided values in `networkOptions` override all defaults.

---

### NodeFetcher

```typescript
class NodeFetcher extends AbstractNetworkFetchableHelper<
  'node-fetch',
  INodeFetchRequestOptions,
  Awaited<ReturnType<typeof fetch>>
>
```

Native `fetch` based fetcher implementation.

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
  params?: Record<string | symbol, any>;
}
```

#### Methods

##### `send(opts, logger?)`

```typescript
override async send(opts: INodeFetchRequestOptions, logger?: any): Promise<Response>
```

Dispatches the request using the native `fetch` API. If `timeout` is provided, creates an `AbortController` that aborts the request after the specified duration in milliseconds. Query `params` are serialized using `node:querystring` and appended to the URL.

---

### NodeFetchNetworkRequest

```typescript
class NodeFetchNetworkRequest extends BaseNetworkRequest<'node-fetch'>
```

Pre-configured HTTP client using native `fetch`.

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

If `headers` is a `Headers` instance, it is converted to a plain object via `Object.fromEntries()` before merging.

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

**Throws:** `Error` with message `'TCP Server | Invalid authenticate duration | Required duration for authenticateOptions'` when `authenticateOptions.required` is `true` and `duration` is missing or negative.

The constructor automatically calls `configure()`, which creates the server and starts listening.

#### Protected Properties

| Property | Type | Description |
|----------|------|-------------|
| `serverOptions` | `Partial<SocketServerOptions>` | Server creation options |
| `listenOptions` | `Partial<ListenOptions>` | Listen configuration |
| `authenticateOptions` | `{ required: boolean; duration?: number }` | Auth settings |
| `clients` | `Record<string, ITcpSocketClient<SocketClientType>>` | Connected client registry |
| `server` | `SocketServerType` | The underlying server instance |
| `extraEvents` | `Record<string, (opts) => void>` | Additional per-client socket events |

#### Methods

##### `configure()`

Creates the server using `createServerFn` and starts listening. Called automatically by the constructor.

```typescript
configure(): void
```

##### `onNewConnection(opts)`

Handles a new client connection. Assigns a unique ID, registers `data`, `error`, `close`, and extra events, tracks the client, and starts the authentication timer if required.

```typescript
onNewConnection(opts: { socket: SocketClientType }): void
```

##### `getClients()`

Returns all connected clients as a record keyed by client ID.

```typescript
getClients(): Record<string, ITcpSocketClient<SocketClientType>>
```

##### `getClient(opts)`

Returns a specific connected client by ID, or `undefined` if not found.

```typescript
getClient(opts: { id: string }): ITcpSocketClient<SocketClientType> | undefined
```

##### `getServer()`

Returns the underlying server instance.

```typescript
getServer(): SocketServerType
```

##### `doAuthenticate(opts)`

Transitions a client's authentication state. Sets `authenticatedAt` timestamp when state becomes `'authenticated'`, clears it otherwise.

```typescript
doAuthenticate(opts: {
  id: string;
  state: 'unauthorized' | 'authenticating' | 'authenticated';
}): void
```

##### `emit(opts)`

Writes data to a specific client's socket. Silently returns (with a log warning) if the client is not found, the socket is not writable, or the payload is empty.

```typescript
emit(opts: { clientId: string; payload: Buffer | string }): void
```

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

The `createServerFn` is pre-set to `net.createServer`. The `scope` is set to `'NetworkTcpServer'`.

#### Static Methods

##### `newInstance(opts)`

Factory method that creates a new `NetworkTcpServer`.

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
constructor(opts: Omit<ITcpSocketServerOptions, 'createServerFn'>)
```

The `createServerFn` is pre-set to `tls.createServer`. The `scope` is set to `'NetworkTlsTcpServer'`. Pass TLS certificates and keys in `serverOptions` (type `TlsOptions` from `node:tls`).

#### Static Methods

##### `newInstance(opts)`

```typescript
static newInstance(
  opts: Omit<ITcpSocketServerOptions, 'createServerFn'>
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

#### Protected Properties

| Property | Type | Description |
|----------|------|-------------|
| `client` | `SocketClientType \| null` | The underlying socket, or `null` when disconnected |
| `options` | `SocketClientOptions` | Connection options |
| `reconnect` | `boolean` | Whether auto-reconnect is enabled (default: `false`) |
| `retry` | `{ maxReconnect: number; currentReconnect: number }` | Reconnect state. `maxReconnect` defaults to `5` |
| `encoding` | `BufferEncoding \| undefined` | Socket encoding |

#### Methods

##### `connect(opts)`

Establishes the connection. If already connected, logs and returns. Creates the socket using `createClientFn`, registers `data`, `close`, and `error` events, and applies encoding if set.

```typescript
connect(opts: { resetReconnectCounter: boolean }): void
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `resetReconnectCounter` | `boolean` | If `true`, resets `retry.currentReconnect` to `0` |

##### `disconnect()`

Destroys the socket, clears the reconnect timeout, and sets `client` to `null`.

```typescript
disconnect(): void
```

##### `forceReconnect()`

Calls `disconnect()` then `connect({ resetReconnectCounter: true })`.

```typescript
forceReconnect(): void
```

##### `isConnected()`

Returns a truthy value if the client exists and its `readyState` is not `'closed'`.

```typescript
isConnected(): SocketClientType | null | undefined
```

##### `emit(opts)`

Writes data to the server. Silently returns (with a log) if the client is not initialized or the payload is empty.

```typescript
emit(opts: { payload: Buffer | string }): void
```

##### `getClient()`

Returns the underlying socket instance, or `null`/`undefined` if not connected.

```typescript
getClient(): SocketClientType | null | undefined
```

##### `handleConnected()`

Default connection handler. Logs the connection and resets the reconnect counter.

```typescript
handleConnected(): void
```

##### `handleData(_opts)`

Default data handler. No-op.

```typescript
handleData(_opts: { identifier: string; message: string | Buffer }): void
```

##### `handleClosed()`

Default close handler. Logs the closure.

```typescript
handleClosed(): void
```

##### `handleError(error)`

Default error handler. Logs the error. If `reconnect` is enabled and the retry limit has not been reached, schedules a reconnect after 5 seconds.

```typescript
handleError(error: any): void
```

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

The `createClientFn` is pre-set to `net.connect`. The `scope` is set to `'NetworkTcpClient'`.

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

The `createClientFn` is pre-set to `tls.connect`. The `scope` is set to `'NetworkTlsTcpClient'`. Pass TLS certificates and keys in `options` (type `ConnectionOptions` from `node:tls`).

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

UDP datagram client with multicast support, using `node:dgram` internally (UDP4).

#### Constructor

```typescript
constructor(opts: INetworkUdpClientProps)
```

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

#### Static Methods

##### `newInstance(opts)`

Factory method that creates a new `NetworkUdpClient`.

```typescript
static newInstance(opts: INetworkUdpClientProps): NetworkUdpClient
```

#### Methods

##### `connect()`

Creates a `dgram.Socket` (type `'udp4'`), registers `close`, `error`, `listening`, and `message` events, then binds to the configured `port` and `host`. The `onBind` callback is invoked after binding completes -- use it to join multicast groups.

```typescript
connect(): void
```

If the client is already initialized, logs a message and returns. If `port` is not set, logs a message and returns.

##### `disconnect()`

Closes the underlying `dgram.Socket` and sets the client to `null`.

```typescript
disconnect(): void
```

##### `isConnected()`

Returns the underlying socket if connected, or `null`/`undefined` if not.

```typescript
isConnected(): dgram.Socket | null | undefined
```

##### `getClient()`

Returns the underlying `dgram.Socket` instance, or `null`/`undefined` if not connected.

```typescript
getClient(): dgram.Socket | null | undefined
```

##### `handleConnected()`

Default connection handler. Logs the bind success with host, port, and multicast address.

```typescript
handleConnected(): void
```

##### `handleData(opts)`

Default data handler. Logs the received message and remote info.

```typescript
handleData(opts: {
  identifier: string;
  message: string | Buffer;
  remoteInfo: dgram.RemoteInfo;
}): void
```

##### `handleClosed()`

Default close handler. Logs the closure with host and port.

```typescript
handleClosed(): void
```

##### `handleError(opts)`

Default error handler. Logs the error with host and port.

```typescript
handleError(opts: { identifier: string; error: Error }): void
```

---

## Types Reference

### TFetcherVariant

```typescript
type TFetcherVariant = 'node-fetch' | 'axios';
```

### TFetcherResponse

```typescript
type TFetcherResponse<T extends TFetcherVariant> =
  T extends 'node-fetch' ? Response : AxiosResponse;
```

### TFetcherWorker

```typescript
type TFetcherWorker<T extends TFetcherVariant> =
  T extends 'axios' ? AxiosInstance : typeof fetch;
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
}
```

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

## See Also

- [Setup & Usage](./) -- Getting started and examples
