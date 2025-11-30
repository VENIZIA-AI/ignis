# Network Helper

The Network helper in Ignis provides a comprehensive suite of utilities for various network communication protocols, including HTTP, TCP, and UDP.

## HTTP Request

The HTTP request helper provides a flexible and extensible framework for making HTTP requests, supporting both `axios` and the native Node.js `fetch` API as underlying clients.

### Creating an HTTP Client

You can create a new HTTP client instance by extending either `AxiosNetworkRequest` or `NodeFetchNetworkRequest`.

**Using Axios:**

```typescript
import { AxiosNetworkRequest } from '@vez/ignis';

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
import { NodeFetchNetworkRequest } from '@vez/ignis';

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
import { NetworkTcpClient } from '@vez/ignis';

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
import { NetworkTcpServer } from '@vez/ignis';

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
import { NetworkUdpClient } from '@vez/ignis';

const udpClient = new NetworkUdpClient({
  identifier: 'my-udp-client',
  port: 8081,
  onData: ({ message, remoteInfo }) => {
    console.log(`Received message from ${remoteInfo.address}:${remoteInfo.port}:`, message.toString());
  },
});

udpClient.connect();
```
