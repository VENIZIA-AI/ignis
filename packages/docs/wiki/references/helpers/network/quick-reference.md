# Quick Reference

| Helper | Protocol | Type | Use Case |
|--------|----------|------|----------|
| **AxiosNetworkRequest** | HTTP/HTTPS | Client | REST API calls (axios-based) |
| **NodeFetchNetworkRequest** | HTTP/HTTPS | Client | REST API calls (native fetch) |
| **NetworkTcpClient** | TCP | Client | Plain TCP connections |
| **NetworkTlsTcpClient** | TLS/SSL | Client | Secure TCP connections |
| **NetworkTcpServer** | TCP | Server | Plain TCP server |
| **NetworkTlsTcpServer** | TLS/SSL | Server | Secure TCP server |
| **NetworkUdpClient** | UDP | Client | Datagram sockets |

### HTTP Methods

All HTTP helpers expose these methods via the `IFetchable` interface:

| Method | Purpose |
|--------|---------|
| `send({ url, method, body })` | Send request with explicit method |
| `get({ url })` | GET request |
| `post({ url, body })` | POST request |
| `put({ url, body })` | PUT request |
| `patch({ url, body })` | PATCH request |
| `delete({ url })` | DELETE request |

### TCP Operations

| Class | Methods |
|-------|---------|
| **Client** | `connect({ resetReconnectCounter })`, `emit({ payload })`, `disconnect()`, `forceReconnect()`, `isConnected()`, `getClient()` |
| **Server** | `emit({ clientId, payload })`, `getClients()`, `getClient({ id })`, `getServer()`, `doAuthenticate({ id, state })` |

::: details Import Paths
```typescript
import {
  // HTTP
  AxiosNetworkRequest,
  NodeFetchNetworkRequest,
  BaseNetworkRequest,
  // TCP
  NetworkTcpClient,
  NetworkTcpServer,
  NetworkTlsTcpClient,
  NetworkTlsTcpServer,
  BaseNetworkTcpClient,
  BaseNetworkTcpServer,
  // UDP
  NetworkUdpClient,
  // Types & Interfaces
  IAxiosNetworkRequestOptions,
  INodeFetchNetworkRequestOptions,
  INetworkTcpClientProps,
  ITcpSocketServerOptions,
  ITcpSocketClient,
  IRequestOptions,
  IFetchable,
  IAxiosRequestOptions,
  INodeFetchRequestOptions,
} from '@venizia/ignis-helpers';
```
:::
