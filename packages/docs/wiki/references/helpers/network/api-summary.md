# API Summary

::: details API Summary

### BaseNetworkRequest (HTTP)

| Method | Returns | Description |
|--------|---------|-------------|
| `getNetworkService()` | `IFetchable` | Returns the underlying fetcher instance |
| `getWorker()` | `AxiosInstance \| typeof fetch` | Returns the raw HTTP client |
| `getRequestUrl(opts)` | `string` | Builds a full URL from base + paths |
| `getRequestPath(opts)` | `string` | Joins path segments with leading `/` |

### IFetchable (HTTP Fetcher)

| Method | Returns | Description |
|--------|---------|-------------|
| `send(opts)` | `Promise<Response>` | Send request with explicit method |
| `get(opts)` | `Promise<Response>` | GET request |
| `post(opts)` | `Promise<Response>` | POST request |
| `put(opts)` | `Promise<Response>` | PUT request |
| `patch(opts)` | `Promise<Response>` | PATCH request |
| `delete(opts)` | `Promise<Response>` | DELETE request |
| `getWorker()` | `AxiosInstance \| typeof fetch` | Returns the raw HTTP client |

### BaseNetworkTcpClient (TCP Client)

| Method | Returns | Description |
|--------|---------|-------------|
| `connect(opts)` | `void` | Connect to TCP server |
| `disconnect()` | `void` | Close connection and clear reconnect timer |
| `forceReconnect()` | `void` | Disconnect then connect with counter reset |
| `emit(opts)` | `void` | Send data to server |
| `isConnected()` | `boolean` | Check connection status |
| `getClient()` | `SocketClientType \| null` | Returns the underlying socket |

### BaseNetworkTcpServer (TCP Server)

| Method | Returns | Description |
|--------|---------|-------------|
| `emit(opts)` | `void` | Send data to specific client by ID |
| `getClients()` | `Record<string, ITcpSocketClient>` | Get all connected clients |
| `getClient(opts)` | `ITcpSocketClient \| undefined` | Get a specific client by ID |
| `getServer()` | `SocketServerType` | Returns the underlying server instance |
| `doAuthenticate(opts)` | `void` | Update client authentication state |

### NetworkUdpClient (UDP)

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `void` | Bind UDP socket and start listening |
| `disconnect()` | `void` | Close UDP socket |
| `isConnected()` | `boolean` | Check if socket is bound |
| `getClient()` | `dgram.Socket \| null` | Returns the underlying dgram socket |
| `NetworkUdpClient.newInstance(opts)` | `NetworkUdpClient` | Static factory method |

:::
