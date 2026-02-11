# Usage

## HTTP Requests

### Sending Requests

Access the underlying fetcher via `getNetworkService()`, then use `send()` or the convenience methods:

```typescript
class MyApiClient extends AxiosNetworkRequest {
  constructor() {
    super({
      name: 'MyApiClient',
      networkOptions: {
        baseUrl: 'https://api.example.com',
        timeout: 5000,
      },
    });
  }

  async getUsers() {
    const response = await this.getNetworkService().send({
      url: '/users',
      method: 'get',
    });
    return response.data;
  }

  async createUser(data: CreateUserDto) {
    const response = await this.getNetworkService().send({
      url: '/users',
      method: 'post',
      body: data,
    });
    return response.data;
  }
}
```

### Convenience Methods

In addition to `send()`, the fetcher exposes shorthand methods for each HTTP method:

```typescript
const fetcher = this.getNetworkService();

// These are equivalent:
await fetcher.send({ url: '/users', method: 'get' });
await fetcher.get({ url: '/users' });

// POST with body
await fetcher.post({ url: '/users', body: { name: 'Alice' } });

// All methods: get(), post(), put(), patch(), delete()
```

### Request Options

#### Axios Request Options

```typescript
interface IAxiosRequestOptions extends AxiosRequestConfig, IRequestOptions {
  url: string;
  method?: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options';
  params?: Record<string, any>;     // Query parameters
  body?: Record<string, any>;       // Request body (mapped to axios `data`)
  headers?: Record<string, any>;    // Additional headers
  // Plus all AxiosRequestConfig options (e.g., rejectUnauthorized for HTTPS)
}
```

> [!NOTE]
> For HTTPS requests, the `AxiosFetcher` automatically creates an `https.Agent` with `rejectUnauthorized` defaulting to `false`. Override by passing `rejectUnauthorized: true` in the request options.

#### Node Fetch Request Options

```typescript
interface INodeFetchRequestOptions extends RequestInit, IRequestOptions {
  url: string;
  method?: string;
  params?: Record<string | symbol, any>;  // Query parameters (serialized via querystring)
  // body, headers, signal from RequestInit
  timeout?: number;                        // Request timeout in ms (uses AbortController)
}
```

### Service with HTTP Client

```typescript
import { AxiosNetworkRequest } from '@venizia/ignis-helpers';

class PaymentGateway extends AxiosNetworkRequest {
  constructor() {
    super({
      name: 'PaymentGateway',
      networkOptions: {
        baseUrl: process.env.PAYMENT_API_URL,
        timeout: 30000,
        headers: {
          'X-API-Key': process.env.PAYMENT_API_KEY,
        },
      },
    });
  }

  async charge(amount: number, currency: string) {
    const response = await this.getNetworkService().send({
      url: '/v1/charges',
      method: 'post',
      body: { amount, currency },
    });

    this.logger.for('charge').info('Payment processed: %s', response.data.id);
    return response.data;
  }
}
```

## TCP Client

```typescript
import { NetworkTcpClient } from '@venizia/ignis-helpers';

const tcpClient = new NetworkTcpClient({
  identifier: 'my-tcp-client',
  options: { host: 'localhost', port: 8080 },
  reconnect: true,
  maxRetry: 5,
  encoding: 'utf8',
  onConnected: ({ client }) => { console.log('Connected to server'); },
  onData: ({ identifier, message }) => { console.log('Received:', message.toString()); },
  onClosed: ({ client }) => { console.log('Connection closed'); },
  onError: (error) => { console.error('Connection error:', error); },
});

// Connect
tcpClient.connect({ resetReconnectCounter: true });

// Send data
tcpClient.emit({ payload: 'Hello, Server!' });
tcpClient.emit({ payload: Buffer.from([0x01, 0x02, 0x03]) });

// Check connection
if (tcpClient.isConnected()) {
  // ...
}

// Disconnect
tcpClient.disconnect();

// Force reconnect (disconnect + connect with counter reset)
tcpClient.forceReconnect();
```

## TCP Server

```typescript
import { NetworkTcpServer } from '@venizia/ignis-helpers';

const tcpServer = new NetworkTcpServer({
  identifier: 'my-tcp-server',
  serverOptions: {},
  listenOptions: { port: 8080, host: '0.0.0.0' },
  authenticateOptions: { required: true, duration: 5000 },
  onServerReady: ({ server }) => { console.log('TCP server listening'); },
  onClientConnected: ({ id, socket }) => { console.log(`Client ${id} connected`); },
  onClientData: ({ id, socket, data }) => { console.log(`Data from ${id}:`, data.toString()); },
  onClientClose: ({ id, socket }) => { console.log(`Client ${id} disconnected`); },
  onClientError: ({ id, socket, error }) => { console.error(`Error from ${id}:`, error); },
});

// Send to specific client
tcpServer.emit({ clientId: 'client-123', payload: 'Hello client' });

// Get all connected clients
const clients = tcpServer.getClients();

// Get specific client
const client = tcpServer.getClient({ id: 'client-123' });

// Manually update client auth state
tcpServer.doAuthenticate({ id: 'client-123', state: 'authenticated' });

// Get the underlying server
const server = tcpServer.getServer();
```

### TCP Server with Authentication

```typescript
import { NetworkTcpServer } from '@venizia/ignis-helpers';

const server = new NetworkTcpServer({
  identifier: 'auth-tcp-server',
  serverOptions: {},
  listenOptions: { port: 9000, host: '0.0.0.0' },
  authenticateOptions: { required: true, duration: 5000 },

  onClientData: ({ id, data }) => {
    const message = data.toString();

    // Check if client needs authentication
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

    // Handle authenticated client data
    console.log(`Authenticated data from ${id}:`, message);
  },
});
```

## TLS (Secure TCP)

### TLS Client

```typescript
import { NetworkTlsTcpClient } from '@venizia/ignis-helpers';

const tlsClient = new NetworkTlsTcpClient({
  identifier: 'secure-client',
  options: {
    host: 'secure.example.com',
    port: 443,
    rejectUnauthorized: true,
    // TLS options
    ca: fs.readFileSync('ca.crt'),
    cert: fs.readFileSync('client.crt'),
    key: fs.readFileSync('client.key'),
  },
  onData: ({ message }) => {
    console.log('Secure data:', message);
  },
});

tlsClient.connect({ resetReconnectCounter: true });
```

> [!NOTE]
> `NetworkTlsTcpClient` uses `tls.connect` under the hood and accepts `ConnectionOptions` from `node:tls`. All other options (`reconnect`, `maxRetry`, callbacks) are identical to `NetworkTcpClient`.

### TLS Server

```typescript
import { NetworkTlsTcpServer } from '@venizia/ignis-helpers';

const tlsServer = new NetworkTlsTcpServer({
  identifier: 'secure-tcp-server',
  serverOptions: {
    cert: fs.readFileSync('server.crt'),
    key: fs.readFileSync('server.key'),
    ca: [fs.readFileSync('ca.crt')],
    requestCert: true,
  },
  listenOptions: {
    port: 8443,
    host: '0.0.0.0',
  },
  authenticateOptions: {
    required: false,
  },
  onClientConnected: ({ id, socket }) => {
    console.log(`Secure client ${id} connected`);
  },
  onClientData: ({ id, socket, data }) => {
    console.log(`Secure data from ${id}:`, data.toString());
  },
});
```

> [!NOTE]
> `NetworkTlsTcpServer` uses `tls.createServer` under the hood and accepts `TlsOptions` from `node:tls`. All handlers and methods are identical to `NetworkTcpServer`.

## UDP

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
  onConnected: ({ identifier, host, port }) => {
    console.log(`UDP socket bound to ${host}:${port}`);
  },
  onData: ({ identifier, message, remoteInfo }) => {
    console.log(`From ${remoteInfo.address}:${remoteInfo.port}:`, message.toString());
  },
  onClosed: ({ identifier, host, port }) => {
    console.log(`UDP socket closed | ${host}:${port}`);
  },
  onError: ({ identifier, host, port, error }) => {
    console.error('UDP error:', error);
  },
  onBind: async ({ socket, multicastAddress }) => {
    if (multicastAddress?.groups) {
      for (const group of multicastAddress.groups) {
        socket.addMembership(group, multicastAddress.interface);
      }
    }
  },
});

// Start listening
udpClient.connect();

// Check status
if (udpClient.isConnected()) {
  // ...
}

// Get the underlying dgram.Socket
const socket = udpClient.getClient();

// Close
udpClient.disconnect();
```
