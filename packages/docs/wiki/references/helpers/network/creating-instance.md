# Creating an Instance

## HTTP Request

The HTTP request helper provides a flexible and extensible framework for making HTTP requests, supporting both `axios` and the native Node.js `fetch` API.

### Class Hierarchy

```
BaseNetworkRequest<T>           (extends BaseHelper)
  ├── AxiosNetworkRequest       (T = 'axios')
  └── NodeFetchNetworkRequest   (T = 'node-fetch')

AbstractNetworkFetchableHelper<V, RQ, RS>  (implements IFetchable)
  ├── AxiosFetcher              (V = 'axios')
  └── NodeFetcher               (V = 'node-fetch')
```

### Configuration Interfaces

```typescript
// Axios configuration
interface IAxiosNetworkRequestOptions {
  name: string;
  networkOptions: Omit<AxiosRequestConfig, 'baseURL'> & {
    baseUrl?: string;
  };
}

// Node Fetch configuration
interface INodeFetchNetworkRequestOptions {
  name: string;
  networkOptions: RequestInit & {
    baseUrl?: string;
  };
}
```

### Using Axios

```typescript
import { AxiosNetworkRequest } from '@venizia/ignis-helpers';

class MyApiClient extends AxiosNetworkRequest {
  constructor() {
    super({
      name: 'MyApiClient',
      networkOptions: {
        baseUrl: 'https://api.example.com',
        timeout: 5000,
        headers: {
          'X-Custom-Header': 'MyValue',
          'Authorization': 'Bearer token',
        },
        // Full axios options available
        withCredentials: true,
        validateStatus: (status) => status < 500,
      },
    });
  }
}
```

> [!TIP]
> `AxiosNetworkRequest` sets sensible defaults: `Content-Type: application/json`, `withCredentials: true`, `validateStatus: status < 500`, and `timeout: 60000` (1 minute). Your options override these defaults.

### Using Node.js Fetch

```typescript
import { NodeFetchNetworkRequest } from '@venizia/ignis-helpers';

class MyApiClient extends NodeFetchNetworkRequest {
  constructor() {
    super({
      name: 'MyApiClient',
      networkOptions: {
        baseUrl: 'https://api.example.com',
        headers: {
          'Content-Type': 'application/json',
        },
        // Full RequestInit options available
        credentials: 'include',
        mode: 'cors',
      },
    });
  }
}
```

## TCP Client

```typescript
import { NetworkTcpClient } from '@venizia/ignis-helpers';

const tcpClient = new NetworkTcpClient({
  identifier: 'my-tcp-client',
  options: {
    host: 'localhost',
    port: 8080,
  },
  reconnect: true,
  maxRetry: 5,
  encoding: 'utf8',
  onConnected: ({ client }) => { console.log('Connected'); },
  onData: ({ identifier, message }) => { console.log('Received:', message.toString()); },
  onClosed: ({ client }) => { console.log('Closed'); },
  onError: (error) => { console.error('Error:', error); },
});
```

::: details INetworkTcpClientProps
```typescript
interface INetworkTcpClientProps<SocketClientOptions, SocketClientType> {
  identifier: string;                  // Unique client identifier
  scope?: string;                      // Logger scope (defaults to identifier)

  options: SocketClientOptions;        // TcpSocketConnectOpts or ConnectionOptions
  reconnect?: boolean;                 // Enable auto-reconnect (default: false)
  maxRetry?: number;                   // Max reconnect attempts (default: 5, -1 = infinite)
  encoding?: BufferEncoding;           // Data encoding (e.g., 'utf8')

  // Handlers (all optional -- defaults to internal logging methods)
  onConnected?: (opts: { client: SocketClientType }) => ValueOrPromise<void>;
  onData?: (opts: { identifier: string; message: string | Buffer }) => ValueOrPromise<void>;
  onClosed?: (opts: { client: SocketClientType }) => void;
  onError?: (error: any) => void;
}
```

For `NetworkTcpClient`, the `createClientFn` is auto-set to `net.connect`. You only need to provide the options above.
:::

## TCP Server

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
> When `authenticateOptions.required` is `true`, you **must** provide a positive `duration` value. Clients that do not authenticate within this duration are disconnected. Use `doAuthenticate()` in your `onClientData` handler to set the client's authentication state.

::: details ITcpSocketServerOptions
```typescript
interface ITcpSocketServerOptions<
  SocketServerOptions extends ServerOpts = ServerOpts,
  SocketServerType extends SocketServer = SocketServer,
  SocketClientType extends SocketClient = SocketClient,
> {
  scope?: string;
  identifier: string;

  serverOptions: Partial<SocketServerOptions>;   // node:net or node:tls server options
  listenOptions: Partial<ListenOptions>;          // { port, host, backlog, ... }
  authenticateOptions: {
    required: boolean;
    duration?: number;     // Timeout in ms (required when required=true)
  };

  extraEvents?: Record<
    string,
    (opts: { id: string; socket: SocketClientType; args: any }) => ValueOrPromise<void>
  >;

  // Handlers (all optional)
  onServerReady?: (opts: { server: SocketServerType }) => void;
  onClientConnected?: (opts: { id: string; socket: SocketClientType }) => void;
  onClientData?: (opts: { id: string; socket: SocketClientType; data: Buffer | string }) => void;
  onClientClose?: (opts: { id: string; socket: SocketClientType }) => void;
  onClientError?: (opts: { id: string; socket: SocketClientType; error: Error }) => void;
}
```

For `NetworkTcpServer`, the `createServerFn` is auto-set to `net.createServer`. You only need to provide the options above.
:::

::: details ITcpSocketClient (Client State Tracking)
Each connected client is tracked via `ITcpSocketClient`:

```typescript
interface ITcpSocketClient<SocketClientType> {
  id: string;
  socket: SocketClientType;
  state: 'unauthorized' | 'authenticating' | 'authenticated';
  subscriptions: Set<string>;
  storage: {
    connectedAt: dayjs.Dayjs;
    authenticatedAt: dayjs.Dayjs | null;
    [additionField: symbol | string]: any;  // Extensible storage
  };
}
```
:::

## UDP Client

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
  onConnected: ({ identifier, host, port }) => { console.log(`Bound to ${host}:${port}`); },
  onData: ({ identifier, message, remoteInfo }) => { console.log('Data:', message.toString()); },
  onClosed: ({ identifier, host, port }) => { console.log('Closed'); },
  onError: ({ identifier, host, port, error }) => { console.error('Error:', error); },
  onBind: async ({ socket, multicastAddress }) => {
    if (multicastAddress?.groups) {
      for (const group of multicastAddress.groups) {
        socket.addMembership(group, multicastAddress.interface);
      }
    }
  },
});
```

::: details INetworkUdpClientProps
```typescript
interface INetworkUdpClientProps {
  identifier: string;
  host?: string;                      // Bind address
  port: number;                       // Bind port
  reuseAddr?: boolean;                // Allow address reuse

  multicastAddress?: {
    groups?: Array<string>;           // Multicast group addresses
    interface?: string;               // Multicast interface
  };

  // Handlers (all optional -- defaults to internal logging methods)
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
:::
