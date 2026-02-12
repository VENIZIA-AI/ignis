# Network

Multi-protocol network communication helpers for HTTP requests, TCP/TLS sockets, and UDP datagrams with scoped logging, auto-reconnect, and client authentication support.

## Quick Reference

| Class | Extends | Protocol | Type |
|-------|---------|----------|------|
| `AxiosNetworkRequest` | `BaseNetworkRequest<'axios'>` | HTTP/HTTPS | Client |
| `NodeFetchNetworkRequest` | `BaseNetworkRequest<'node-fetch'>` | HTTP/HTTPS | Client |
| `NetworkTcpClient` | `BaseNetworkTcpClient` | TCP | Client |
| `NetworkTcpServer` | `BaseNetworkTcpServer` | TCP | Server |
| `NetworkTlsTcpClient` | `BaseNetworkTcpClient` | TLS/SSL | Client |
| `NetworkTlsTcpServer` | `BaseNetworkTcpServer` | TLS/SSL | Server |
| `NetworkUdpClient` | `BaseHelper` | UDP | Client |

#### Import Paths

```typescript
// Main package -- TCP, UDP, and Node Fetch
import {
  NodeFetchNetworkRequest,
  BaseNetworkRequest,
  NetworkTcpClient,
  NetworkTcpServer,
  NetworkTlsTcpClient,
  NetworkTlsTcpServer,
  BaseNetworkTcpClient,
  BaseNetworkTcpServer,
  NetworkUdpClient,
} from '@venizia/ignis-helpers';

// Axios (separate export -- optional peer dependency)
import {
  AxiosNetworkRequest,
  AxiosFetcher,
  type IAxiosNetworkRequestOptions,
  type IAxiosRequestOptions,
} from '@venizia/ignis-helpers/axios';

// Types
import type {
  INodeFetchNetworkRequestOptions,
  INodeFetchRequestOptions,
  INetworkTcpClientProps,
  ITcpSocketServerOptions,
  ITcpSocketClient,
  IRequestOptions,
  IFetchable,
  TFetcherVariant,
} from '@venizia/ignis-helpers';
```

## Creating an Instance

### HTTP Request

HTTP helpers follow a two-layer design: a `BaseNetworkRequest` that holds the base URL and delegates to an underlying `IFetchable` fetcher (either Axios or native `fetch`). You typically extend one of the concrete classes to create a typed API client.

#### Axios

```typescript
import { AxiosNetworkRequest } from '@venizia/ignis-helpers/axios';

class PaymentGateway extends AxiosNetworkRequest {
  constructor() {
    super({
      name: 'PaymentGateway',
      networkOptions: {
        baseUrl: 'https://api.payments.com',
        timeout: 30000,
        headers: {
          'X-API-Key': process.env.PAYMENT_API_KEY,
        },
      },
    });
  }
}
```

#### `IAxiosNetworkRequestOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | -- | Helper name, used for scoped logging |
| `networkOptions.baseUrl` | `string` | `undefined` | Base URL prepended to all request paths |
| `networkOptions.timeout` | `number` | `60000` | Request timeout in milliseconds |
| `networkOptions.headers` | `object` | `{ 'content-type': 'application/json; charset=utf-8' }` | Default headers; your values override the default content-type |
| `networkOptions.*` | `AxiosRequestConfig` | -- | All other Axios config options are accepted |

> [!TIP]
> `AxiosNetworkRequest` sets sensible defaults: `Content-Type: application/json`, `withCredentials: true`, `validateStatus: status < 500`, and `timeout: 60000` (1 minute). Your options override these defaults.

#### Node.js Fetch

```typescript
import { NodeFetchNetworkRequest } from '@venizia/ignis-helpers';

class MyApiClient extends NodeFetchNetworkRequest {
  constructor() {
    super({
      name: 'MyApiClient',
      networkOptions: {
        baseUrl: 'https://api.example.com',
        headers: {
          'Authorization': 'Bearer my-token',
        },
        credentials: 'include',
        mode: 'cors',
      },
    });
  }
}
```

#### `INodeFetchNetworkRequestOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | -- | Helper name, used for scoped logging |
| `networkOptions.baseUrl` | `string` | `undefined` | Base URL prepended to all request paths |
| `networkOptions.headers` | `HeadersInit` | `{ 'content-type': 'application/json; charset=utf-8' }` | Default headers; supports `Headers` object or plain object |
| `networkOptions.*` | `RequestInit` | -- | All other `fetch` options are accepted |

### TCP Client / Server

#### TCP Client

```typescript
import { NetworkTcpClient } from '@venizia/ignis-helpers';

const tcpClient = new NetworkTcpClient({
  identifier: 'sensor-reader',
  options: {
    host: 'localhost',
    port: 8080,
  },
  reconnect: true,
  maxRetry: 10,
  encoding: 'utf8',
  onConnected: ({ client }) => { console.log('Connected'); },
  onData: ({ identifier, message }) => { console.log('Data:', message.toString()); },
  onClosed: ({ client }) => { console.log('Closed'); },
  onError: (error) => { console.error('Error:', error); },
});
```

#### TCP Client Options (`INetworkTcpClientProps`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | -- | Unique client identifier for logging |
| `scope` | `string` | `identifier` | Logger scope name |
| `options` | `TcpSocketConnectOpts` | -- | Node.js `net.connect` options (`host`, `port`, etc.) |
| `reconnect` | `boolean` | `false` | Enable automatic reconnection on error |
| `maxRetry` | `number` | `5` | Maximum reconnection attempts |
| `encoding` | `BufferEncoding` | `undefined` | Socket encoding (e.g., `'utf8'`) |
| `onConnected` | `(opts: { client }) => void` | Internal logger | Called when connection is established |
| `onData` | `(opts: { identifier, message }) => void` | No-op | Called when data is received |
| `onClosed` | `(opts: { client }) => void` | Internal logger | Called when connection closes |
| `onError` | `(error: any) => void` | Internal handler with auto-reconnect | Called on connection errors |

#### TCP Server

```typescript
import { NetworkTcpServer } from '@venizia/ignis-helpers';

const tcpServer = new NetworkTcpServer({
  identifier: 'my-tcp-server',
  serverOptions: {},
  listenOptions: { port: 8080, host: '0.0.0.0' },
  authenticateOptions: { required: true, duration: 5000 },
  onServerReady: ({ server }) => { console.log('Listening'); },
  onClientConnected: ({ id, socket }) => { console.log(`Client ${id} connected`); },
  onClientData: ({ id, socket, data }) => { console.log(`Data from ${id}:`, data.toString()); },
  onClientClose: ({ id, socket }) => { console.log(`Client ${id} disconnected`); },
  onClientError: ({ id, socket, error }) => { console.error(`Error from ${id}:`, error); },
});
```

> [!IMPORTANT]
> When `authenticateOptions.required` is `true`, you **must** provide a positive `duration` value. Clients that do not authenticate within this duration are automatically disconnected with an "Unauthorized Client" message. Use `doAuthenticate()` in your `onClientData` handler to transition the client's state.

#### TCP Server Options (`ITcpSocketServerOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | -- | Server identifier for logging |
| `scope` | `string` | `identifier` | Logger scope name |
| `serverOptions` | `Partial<ServerOpts>` | -- | Node.js `net.Server` options |
| `listenOptions` | `Partial<ListenOptions>` | -- | Listen options (`port`, `host`, `backlog`, etc.) |
| `authenticateOptions.required` | `boolean` | -- | Whether clients must authenticate |
| `authenticateOptions.duration` | `number` | `undefined` | Auth timeout in ms (required when `required: true`) |
| `extraEvents` | `Record<string, (opts) => void>` | `{}` | Additional socket events to register per client |
| `onServerReady` | `(opts: { server }) => void` | `undefined` | Called when server starts listening |
| `onClientConnected` | `(opts: { id, socket }) => void` | `undefined` | Called on new client connection |
| `onClientData` | `(opts: { id, socket, data }) => void` | `undefined` | Called when data is received from a client |
| `onClientClose` | `(opts: { id, socket }) => void` | `undefined` | Called when a client disconnects |
| `onClientError` | `(opts: { id, socket, error }) => void` | `undefined` | Called on client socket error |

### TLS Client / Server

TLS variants are identical to their TCP counterparts but use `node:tls` under the hood for encrypted connections. The constructor options accept TLS-specific fields (`cert`, `key`, `ca`, `rejectUnauthorized`, etc.) in addition to all the same handler options.

#### TLS Client

```typescript
import { NetworkTlsTcpClient } from '@venizia/ignis-helpers';
import fs from 'node:fs';

const tlsClient = new NetworkTlsTcpClient({
  identifier: 'secure-client',
  options: {
    host: 'secure.example.com',
    port: 8443,
    rejectUnauthorized: true,
    ca: fs.readFileSync('ca.crt'),
    cert: fs.readFileSync('client.crt'),
    key: fs.readFileSync('client.key'),
  },
  reconnect: true,
  maxRetry: 3,
  onData: ({ message }) => { console.log('Secure data:', message); },
});

tlsClient.connect({ resetReconnectCounter: true });
```

> [!NOTE]
> `NetworkTlsTcpClient` accepts `ConnectionOptions` from `node:tls` in the `options` field. All other options (`reconnect`, `maxRetry`, callbacks) are identical to `NetworkTcpClient`.

#### TLS Server

```typescript
import { NetworkTlsTcpServer } from '@venizia/ignis-helpers';
import fs from 'node:fs';

const tlsServer = new NetworkTlsTcpServer({
  identifier: 'secure-tcp-server',
  serverOptions: {
    cert: fs.readFileSync('server.crt'),
    key: fs.readFileSync('server.key'),
    ca: [fs.readFileSync('ca.crt')],
    requestCert: true,
  },
  listenOptions: { port: 8443, host: '0.0.0.0' },
  authenticateOptions: { required: false },
  onClientData: ({ id, data }) => { console.log(`Secure data from ${id}:`, data.toString()); },
});
```

> [!NOTE]
> `NetworkTlsTcpServer` accepts `TlsOptions` from `node:tls` in `serverOptions`. All handlers and methods are identical to `NetworkTcpServer`.

### UDP Client

```typescript
import { NetworkUdpClient } from '@venizia/ignis-helpers';

const udpClient = NetworkUdpClient.newInstance({
  identifier: 'my-udp-client',
  port: 8081,
  host: '0.0.0.0',
  reuseAddr: true,
  multicastAddress: {
    groups: ['239.1.2.3'],
    interface: '0.0.0.0',
  },
  onData: ({ message, remoteInfo }) => {
    console.log(`From ${remoteInfo.address}:${remoteInfo.port}:`, message.toString());
  },
  onBind: async ({ socket, multicastAddress }) => {
    if (multicastAddress?.groups) {
      for (const group of multicastAddress.groups) {
        socket.addMembership(group, multicastAddress.interface);
      }
    }
  },
});
```

#### UDP Client Options (`INetworkUdpClientProps`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `string` | -- | Unique client identifier for logging |
| `host` | `string` | `undefined` | Bind address |
| `port` | `number` | -- | Bind port |
| `reuseAddr` | `boolean` | `undefined` | Allow address reuse (`SO_REUSEADDR`) |
| `multicastAddress.groups` | `string[]` | `undefined` | Multicast group addresses to join |
| `multicastAddress.interface` | `string` | `undefined` | Network interface for multicast |
| `onConnected` | `(opts: { identifier, host?, port }) => void` | Internal logger | Called when socket starts listening |
| `onData` | `(opts: { identifier, message, remoteInfo }) => void` | Internal logger | Called when data is received |
| `onClosed` | `(opts: { identifier, host?, port }) => void` | Internal logger | Called when socket is closed |
| `onError` | `(opts: { identifier, host?, port, error }) => void` | Internal logger | Called on socket error |
| `onBind` | `(opts: { identifier, socket, host?, port, reuseAddr?, multicastAddress? }) => void` | `undefined` | Called after socket is bound; use to join multicast groups |

## Usage

### HTTP Requests

Access the underlying fetcher via `getNetworkService()`, then use `send()` or the convenience methods (`get`, `post`, `put`, `patch`, `delete`):

```typescript
class PaymentGateway extends AxiosNetworkRequest {
  constructor() {
    super({
      name: 'PaymentGateway',
      networkOptions: {
        baseUrl: process.env.PAYMENT_API_URL,
        timeout: 30000,
        headers: { 'X-API-Key': process.env.PAYMENT_API_KEY },
      },
    });
  }

  async charge(amount: number, currency: string) {
    const url = this.getRequestUrl({ paths: ['v1', 'charges'] });
    const response = await this.getNetworkService().send({
      url,
      method: 'post',
      body: { amount, currency },
    });
    this.logger.for('charge').info('Payment processed: %s', response.data.id);
    return response.data;
  }

  async getTransaction(id: string) {
    const url = this.getRequestUrl({ paths: ['v1', 'transactions', id] });
    return this.getNetworkService().get({ url });
  }
}
```

#### Convenience Methods

```typescript
const fetcher = this.getNetworkService();

// These are equivalent:
await fetcher.send({ url: '/users', method: 'get' });
await fetcher.get({ url: '/users' });

// POST with body
await fetcher.post({ url: '/users', body: { name: 'Alice' } });

// All methods: get(), post(), put(), patch(), delete()
```

#### HTTPS with Axios

For HTTPS requests, the `AxiosFetcher` automatically creates an `https.Agent`. By default, `rejectUnauthorized` is `false`. Override it per request:

```typescript
await fetcher.send({
  url: 'https://strict-api.example.com/data',
  method: 'get',
  rejectUnauthorized: true,
});
```

#### Timeout with Node Fetch

The `NodeFetcher` implements timeout via `AbortController`. Pass `timeout` in each `send()` call:

```typescript
await fetcher.send({
  url: '/slow-endpoint',
  method: 'get',
  timeout: 5000, // Aborts after 5 seconds
});
```

### TCP Communication

```typescript
import { NetworkTcpClient, NetworkTcpServer } from '@venizia/ignis-helpers';

// --- Server ---
const server = new NetworkTcpServer({
  identifier: 'echo-server',
  serverOptions: {},
  listenOptions: { port: 9000, host: '0.0.0.0' },
  authenticateOptions: { required: false },
  onClientData: ({ id, data }) => {
    // Echo back to the sender
    server.emit({ clientId: id, payload: data });
  },
});

// --- Client ---
const client = new NetworkTcpClient({
  identifier: 'echo-client',
  options: { host: 'localhost', port: 9000 },
  reconnect: true,
  maxRetry: 5,
  encoding: 'utf8',
  onData: ({ message }) => { console.log('Echo:', message); },
});

client.connect({ resetReconnectCounter: true });
client.emit({ payload: 'Hello, Server!' });
```

#### Server with Authentication Flow

```typescript
const server = new NetworkTcpServer({
  identifier: 'auth-tcp-server',
  serverOptions: {},
  listenOptions: { port: 9000, host: '0.0.0.0' },
  authenticateOptions: { required: true, duration: 5000 },

  onClientData: ({ id, data }) => {
    const message = data.toString();
    const client = server.getClient({ id });

    if (client?.state === 'unauthorized') {
      if (message === 'secret-token') {
        server.doAuthenticate({ id, state: 'authenticated' });
        server.emit({ clientId: id, payload: 'Authenticated!' });
      } else {
        server.emit({ clientId: id, payload: 'Invalid credentials' });
      }
      return;
    }

    // Handle authenticated client messages
    console.log(`[${id}] ${message}`);
  },
});
```

#### Client State Tracking

Each connected client is tracked as an `ITcpSocketClient`:

```typescript
interface ITcpSocketClient<SocketClientType> {
  id: string;
  socket: SocketClientType;
  state: 'unauthorized' | 'authenticating' | 'authenticated';
  subscriptions: Set<string>;
  storage: {
    connectedAt: dayjs.Dayjs;
    authenticatedAt: dayjs.Dayjs | null;
    [additionField: symbol | string]: any; // Extensible storage
  };
}
```

### TLS Encrypted Communication

TLS classes share the same API as their TCP counterparts. Provide TLS certificates in the `options` or `serverOptions` field:

```typescript
import { NetworkTlsTcpServer, NetworkTlsTcpClient } from '@venizia/ignis-helpers';
import fs from 'node:fs';

// --- TLS Server ---
const tlsServer = new NetworkTlsTcpServer({
  identifier: 'secure-server',
  serverOptions: {
    cert: fs.readFileSync('server.crt'),
    key: fs.readFileSync('server.key'),
    ca: [fs.readFileSync('ca.crt')],
    requestCert: true,
  },
  listenOptions: { port: 8443, host: '0.0.0.0' },
  authenticateOptions: { required: false },
  onClientData: ({ id, data }) => {
    console.log(`Secure data from ${id}:`, data.toString());
  },
});

// --- TLS Client ---
const tlsClient = new NetworkTlsTcpClient({
  identifier: 'secure-client',
  options: {
    host: 'localhost',
    port: 8443,
    rejectUnauthorized: true,
    ca: fs.readFileSync('ca.crt'),
    cert: fs.readFileSync('client.crt'),
    key: fs.readFileSync('client.key'),
  },
  onData: ({ message }) => { console.log('Secure:', message); },
});

tlsClient.connect({ resetReconnectCounter: true });
tlsClient.emit({ payload: 'Hello over TLS!' });
```

### UDP Communication

```typescript
import { NetworkUdpClient } from '@venizia/ignis-helpers';

const udpClient = NetworkUdpClient.newInstance({
  identifier: 'multicast-listener',
  port: 5000,
  host: '0.0.0.0',
  reuseAddr: true,
  multicastAddress: {
    groups: ['239.1.2.3'],
    interface: '0.0.0.0',
  },
  onData: ({ message, remoteInfo }) => {
    console.log(`From ${remoteInfo.address}:${remoteInfo.port}:`, message.toString());
  },
  onBind: async ({ socket, multicastAddress }) => {
    // Join multicast groups after socket is bound
    if (multicastAddress?.groups) {
      for (const group of multicastAddress.groups) {
        socket.addMembership(group, multicastAddress.interface);
      }
    }
  },
});

// Start listening
udpClient.connect();

// Access the underlying dgram.Socket
const socket = udpClient.getClient();

// Check if bound
if (udpClient.isConnected()) {
  // Send a datagram via the raw socket
  socket.send('Hello', 5001, '239.1.2.3');
}

// Stop listening
udpClient.disconnect();
```

## Troubleshooting

### HTTP: "[getRequestUrl] Invalid configuration for third party request base url!"

**Cause:** `getRequestUrl()` was called but no `baseUrl` was provided at construction time or in the call's `opts.baseUrl` parameter.

**Fix:** Provide a `baseUrl` either in the constructor's `networkOptions` or pass it in the `opts` parameter of `getRequestUrl()`:

```typescript
// At construction
const client = new AxiosNetworkRequest({
  name: 'MyClient',
  networkOptions: { baseUrl: 'https://api.example.com' },
});

// Or per call
const url = client.getRequestUrl({
  baseUrl: 'https://api.example.com',
  paths: ['v1', 'users'],
});
```

### HTTP: Timeout not working with NodeFetchNetworkRequest

**Cause:** The `timeout` option on the constructor's `networkOptions` is not automatically applied to individual requests. Timeout must be set per-request.

**Fix:** Pass `timeout` in each `send()` call:

```typescript
await this.getNetworkService().send({
  url: '/slow-endpoint',
  method: 'get',
  timeout: 5000,
});
```

The `NodeFetcher` internally creates an `AbortController` and aborts the request after the specified timeout.

### TCP Server: "Invalid authenticate duration"

**Cause:** `authenticateOptions.required` is `true` but `duration` is missing, zero, or negative.

**Fix:** Provide a positive `duration` value when authentication is required:

```typescript
// Correct
authenticateOptions: { required: true, duration: 5000 }

// Wrong -- throws at construction time
authenticateOptions: { required: true }
authenticateOptions: { required: true, duration: -1 }
```

### TCP Client: Reconnect loop never stops

**Cause:** `maxRetry` is set to `-1` (infinite retries) and the target server is unreachable. The reconnect delay is fixed at 5 seconds between attempts.

**Fix:** Use a finite `maxRetry` value, or set `reconnect: false` if you handle reconnection externally:

```typescript
const client = new NetworkTcpClient({
  identifier: 'my-client',
  options: { host: 'localhost', port: 8080 },
  reconnect: true,
  maxRetry: 5, // Stop after 5 attempts
});
```

### TCP Server: Client emit does nothing

**Cause:** The target client socket is not writable (already closed or half-closed), or the payload is empty. The server logs a warning but does not throw.

**Fix:** Check the client state before emitting:

```typescript
const client = server.getClient({ id: clientId });
if (client && client.socket.writable) {
  server.emit({ clientId, payload: 'Hello' });
}
```

## See Also

- [API Reference](./api) -- Full method signatures and types
