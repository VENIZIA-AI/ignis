# Network Helper

Comprehensive network communication utilities for HTTP, TCP, and UDP protocols with full TypeScript support and customizable options.

## Quick Reference

| Helper | Protocol | Type | Use Case |
|--------|----------|------|----------|
| **AxiosNetworkRequest** | HTTP/HTTPS | Client | REST API calls (axios-based) |
| **NodeFetchNetworkRequest** | HTTP/HTTPS | Client | REST API calls (native fetch) |
| **NetworkTcpClient** | TCP/TLS | Client | Raw TCP connections |
| **NetworkTcpServer** | TCP/TLS | Server | TCP server implementation |
| **NetworkUdpClient** | UDP | Client | Datagram sockets |

### HTTP Methods

| Method | Purpose |
|--------|---------|
| `send({ url, method: 'get' })` | GET request |
| `send({ url, method: 'post', body })` | POST request |
| `send({ url, method: 'put', body })` | PUT request |
| `send({ url, method: 'delete' })` | DELETE request |

### TCP Operations

| Class | Methods |
|-------|---------|
| **Client** | `connect()`, `emit({ payload })`, `disconnect()`, `forceReconnect()` |
| **Server** | `broadcast({ message })`, `sendToClient({ id, message })` |

## HTTP Request

The HTTP request helper provides a flexible and extensible framework for making HTTP requests, supporting both `axios` and the native Node.js `fetch` API.

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

  async getUsers() {
    const response = await this.getNetworkService().send({
      url: '/users',
      method: 'get',
      timeout: 5000, // Timeout support
    });
    return response.json();
  }
}
```

### Request Options

#### Axios Request Options

```typescript
interface IAxiosRequestOptions {
  url: string;
  method?: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options';
  params?: Record<string, any>;     // Query parameters
  body?: any;                        // Request body
  headers?: Record<string, string>;  // Additional headers
  rejectUnauthorized?: boolean;      // SSL verification (default: false)
  // Plus all AxiosRequestConfig options
}
```

#### Node Fetch Request Options

```typescript
interface INodeFetchRequestOptions {
  url: string;
  method?: string;
  params?: Record<string, any>;  // Query parameters
  body?: any;                     // Request body
  headers?: Record<string, string>;
  timeout?: number;               // Request timeout in ms
  // Plus all RequestInit options
}
```

## TCP Socket

The TCP Socket helpers provide robust TCP and TLS/SSL connection management with automatic reconnection.

### TCP Client

```typescript
import { NetworkTcpClient } from '@venizia/ignis-helpers';

const tcpClient = new NetworkTcpClient({
  identifier: 'my-tcp-client',
  options: {
    host: 'localhost',
    port: 8080,
  },
  reconnect: true,           // Auto-reconnect on disconnect
  maxRetry: 5,               // Max reconnection attempts
  encoding: 'utf8',          // Data encoding

  onConnected: ({ client }) => {
    console.log('Connected to server');
  },
  onData: ({ identifier, message }) => {
    console.log('Received:', message.toString());
  },
  onClosed: ({ client }) => {
    console.log('Connection closed');
  },
  onError: (error) => {
    console.error('Connection error:', error);
  },
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

// Force reconnect
tcpClient.forceReconnect();
```

### TLS TCP Client

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
```

### TCP Server

```typescript
import { NetworkTcpServer } from '@venizia/ignis-helpers';

const tcpServer = new NetworkTcpServer({
  identifier: 'my-tcp-server',
  listenOptions: {
    port: 8080,
    host: '0.0.0.0',
  },
  authenticateOptions: {
    required: true,
    timeout: 5000,
  },

  onClientConnect: ({ id, socket }) => {
    console.log(`Client ${id} connected`);
  },
  onClientData: ({ id, data }) => {
    console.log(`Data from ${id}:`, data.toString());
  },
  onClientDisconnect: ({ id }) => {
    console.log(`Client ${id} disconnected`);
  },
  onAuthenticate: async ({ id, data }) => {
    // Return true to authenticate
    return data.toString() === 'secret-token';
  },
});

// Broadcast to all clients
tcpServer.broadcast({ message: 'Hello everyone!' });

// Send to specific client
tcpServer.sendToClient({ clientId: 'client-123', message: 'Private message' });

// Get connected clients
const clients = tcpServer.getClients();
```

## UDP Socket

The UDP Socket helper provides datagram socket communication with multicast support.

### UDP Client

```typescript
import { NetworkUdpClient } from '@venizia/ignis-helpers';

const udpClient = NetworkUdpClient.newInstance({
  identifier: 'my-udp-client',
  port: 8081,
  host: '0.0.0.0',          // Bind address
  reuseAddr: true,           // Allow address reuse

  // Multicast configuration
  multicastAddress: {
    groups: ['239.1.2.3'],
    interface: '0.0.0.0',
  },

  onConnected: ({ identifier, port }) => {
    console.log(`UDP socket bound to port ${port}`);
  },
  onData: ({ identifier, message, remoteInfo }) => {
    console.log(`From ${remoteInfo.address}:${remoteInfo.port}:`, message.toString());
  },
  onBind: async ({ socket, multicastAddress }) => {
    // Join multicast groups after binding
    if (multicastAddress?.groups) {
      for (const group of multicastAddress.groups) {
        socket.addMembership(group, multicastAddress.interface);
      }
    }
  },
  onError: ({ error }) => {
    console.error('UDP error:', error);
  },
});

// Start listening
udpClient.connect();

// Check status
if (udpClient.isConnected()) {
  // ...
}

// Close
udpClient.disconnect();
```

## Common Patterns

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

### Real-time Data Feed (TCP)

```typescript
import { NetworkTcpClient } from '@venizia/ignis-helpers';

class MarketDataFeed extends NetworkTcpClient<TcpSocketConnectOpts, Socket> {
  constructor() {
    super({
      identifier: 'market-data',
      scope: 'MarketDataFeed',
      options: { host: 'feed.exchange.com', port: 9000 },
      reconnect: true,
      maxRetry: -1, // Infinite retries
      encoding: 'utf8',
    });
  }

  handleData(opts: { identifier: string; message: Buffer }) {
    const tick = JSON.parse(opts.message.toString());
    this.emit('tick', tick);
  }
}
```

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Network operations in services

- **Other Helpers:**
  - [Helpers Index](./index) - All available helpers
  - [Queue Helper](./queue) - Message queuing
  - [Redis Helper](./redis) - Redis connections

- **Best Practices:**
  - [Security Guidelines](/best-practices/security-guidelines) - Network security
  - [Performance Optimization](/best-practices/performance-optimization) - Connection pooling
