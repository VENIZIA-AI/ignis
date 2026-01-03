# Network Helper

Comprehensive network communication utilities for HTTP, TCP, and UDP protocols.

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
| `get({ url })` | GET request |
| `post({ url, data })` | POST request |
| `put({ url, data })` | PUT request |
| `delete({ url })` | DELETE request |

### TCP Operations

| Class | Methods |
|-------|---------|
| **Client** | `connect()`, `emit({ payload })`, `disconnect()` |
| **Server** | `broadcast({ message })`, `sendToClient({ id, message })` |

## HTTP Request

The HTTP request helper provides a flexible and extensible framework for making HTTP requests, supporting both `axios` and the native Node.js `fetch` API as underlying clients.

### Creating an HTTP Client

You can create a new HTTP client instance by extending either `AxiosNetworkRequest` or `NodeFetchNetworkRequest`.

**Using Axios:**

```typescript
import { AxiosNetworkRequest } from '@venizia/ignis';

class MyApiClient extends AxiosNetworkRequest {
  constructor() {
    super({
      name: 'MyApiClient',
      networkOptions: {
        baseUrl: 'https://api.example.com',
        timeout: 5000,
        headers: {
          'X-Custom-Header': 'MyValue',
        },
      },
    });
  }

  async getUsers() {
    const response = await this.getNetworkService().get({ url: '/users' });
    return response.data;
  }
}
```

**Using Node.js Fetch:**

```typescript
import { NodeFetchNetworkRequest } from '@venizia/ignis';

class MyApiClient extends NodeFetchNetworkRequest {
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
    const response = await this.getNetworkService().get({ url: '/users' });
    return response.json();
  }
}
```

## TCP Socket

The TCP Socket helpers provide a robust way to create and manage TCP and TLS/SSL connections.

### TCP Client

```typescript
import { NetworkTcpClient } from '@venizia/ignis';

const tcpClient = new NetworkTcpClient({
  identifier: 'my-tcp-client',
  options: { host: 'localhost', port: 8080 },
  reconnect: true,
  onData: ({ message }) => {
    console.log('Received data:', message.toString());
  },
});

tcpClient.connect({ resetReconnectCounter: true });
tcpClient.emit({ payload: 'Hello, Server!' });
```

### TCP Server

```typescript
import { NetworkTcpServer } from '@venizia/ignis';

const tcpServer = new NetworkTcpServer({
  identifier: 'my-tcp-server',
  listenOptions: { port: 8080 },
  authenticateOptions: { required: false },
  onClientData: ({ id, data }) => {
    console.log(`Received data from client ${id}:`, data.toString());
  },
});
```

## UDP Socket

The UDP Socket helper provides a way to create and manage UDP datagram sockets.

### UDP Client

```typescript
import { NetworkUdpClient } from '@venizia/ignis';

const udpClient = new NetworkUdpClient({
  identifier: 'my-udp-client',
  port: 8081,
  onData: ({ message, remoteInfo }) => {
    console.log(`Received message from ${remoteInfo.address}:${remoteInfo.port}:`, message.toString());
  },
});

udpClient.connect();
```

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Network operations in services

- **Other Helpers:**
  - [Helpers Index](./index) - All available helpers

- **Best Practices:**
  - [Security Guidelines](/best-practices/security-guidelines) - Network security
