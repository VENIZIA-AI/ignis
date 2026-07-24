---
title: Network
description: HTTP request clients, TCP/TLS socket clients and servers, and a UDP client, all built on scoped logging with automatic secret redaction
difficulty: intermediate
---

# Network

Network helpers give you HTTP request clients (fetch or Axios), symmetric TCP/TLS socket client-server pairs, and a UDP client. All three share the same options-object construction and scoped logging as the rest of the framework.

## In one example

Extend `NodeFetchNetworkRequest` to build a typed HTTP client backed by native `fetch` - no extra dependency required.

```typescript
import { NodeFetchNetworkRequest } from '@venizia/ignis-helpers';

class GitHubApi extends NodeFetchNetworkRequest {
  constructor() {
    super({
      name: 'GitHubApi',
      networkOptions: { baseUrl: 'https://api.github.com' },
    });
  }

  async getUser(username: string) {
    const url = this.getRequestUrl({ paths: ['users', username] });
    const response = await this.getNetworkService().get({ url });
    return response.json();
  }
}
```

`getRequestUrl()` joins the constructor's `baseUrl` with the path segments. `getNetworkService()` returns the underlying fetcher, which exposes `send()` plus `get`/`post`/`put`/`patch`/`delete`/`query` shortcuts.

## How it works

- **HTTP is two layers.** `BaseNetworkRequest` holds the base URL and delegates every call to an `IFetchable` fetcher. You extend one of two concrete clients:

  | Client | Wraps | Import from |
  |---|---|---|
  | `NodeFetchNetworkRequest` | native `fetch` | root barrel |
  | `AxiosNetworkRequest` | Axios | `@venizia/ignis-helpers/axios` sub-path |

- **`axios` is optional.** It is an optional peer dependency. `AxiosNetworkRequest` is exported only from the `/axios` sub-path, never from the root barrel.
- **TCP and TLS share one hierarchy.** `BaseNetworkTcpServer`/`BaseNetworkTcpClient` are abstract classes. Each takes a create-function matching its transport, and each concrete pair only pre-wires that function:

  | Transport | Server class | Client class | Node module |
  |---|---|---|---|
  | Plain TCP | `NetworkTcpServer` | `NetworkTcpClient` | `net` |
  | TLS | `NetworkTlsTcpServer` | `NetworkTlsTcpClient` | `tls` |

  Constructor options and every method are otherwise identical between the plain and encrypted variants.

- **Servers track per-client authentication state.** `unauthorized` → `authenticating` → `authenticated`.
- **Clients auto-reconnect on a fixed delay.** 5 seconds between attempts, up to `maxRetry` attempts, when `reconnect: true`. See the [Full reference](/extensions/helpers/network/api) for the `maxRetry: -1` edge case.
- **UDP has no client/server split.** `NetworkUdpClient` is a single class wrapping `node:dgram` in UDP4 mode. It supports optional multicast group joining via `onBind`.
- **Every class extends `BaseHelper`.** `this.logger.for('methodName')` scoped logging is available throughout.

**HTTP method case**

| Layer | Case | Why |
|-------|------|-----|
| `HTTP.Methods.GET`/`.POST`/`.QUERY`/... tokens | always lowercase | Required by `@hono/zod-openapi` route definitions |
| Wire dispatch | uppercased right before send | Node's undici only auto-normalizes `DELETE`/`GET`/`HEAD`/`OPTIONS`/`POST`/`PUT`. A lowercase `patch` or `query` would go out unchanged |

## Common tasks

### Use Axios instead of fetch

Import from the `/axios` sub-path - never from the root barrel, since `axios` is an optional peer dependency.

```typescript
import { AxiosNetworkRequest } from '@venizia/ignis-helpers/axios';

class PaymentGateway extends AxiosNetworkRequest {
  constructor() {
    super({
      name: 'PaymentGateway',
      networkOptions: {
        baseUrl: 'https://api.payments.com',
        timeout: 30000,
        headers: { 'X-API-Key': process.env.PAYMENT_API_KEY },
      },
    });
  }
}
```

`AxiosNetworkRequest` applies these defaults - override any of them in `networkOptions`:

| Setting | Default |
|---|---|
| `Content-Type` header | `application/json` |
| `withCredentials` | `true` |
| `validateStatus` | `status < 500` |
| `timeout` | `60000` ms |

### Log a request with secrets redacted

Pass a logger as the second argument to `send()` or any shortcut method - typically `this.logger` from a `BaseHelper` subclass. The fetcher then logs the URL and config at `info` level. It runs the config through `redactSecrets()` first, so values like `Authorization` or `X-API-Key` reach the log as `'[REDACTED]'`. Without a logger argument, nothing is logged.

```typescript
async charge(amount: number, currency: string) {
  const url = this.getRequestUrl({ paths: ['v1', 'charges'] });
  const response = await this.getNetworkService().post(
    { url, body: { amount, currency } },
    this.logger,
  );
  return response.data;
}
```

### Open a TCP connection

```typescript
import { NetworkTcpClient, NetworkTcpServer } from '@venizia/ignis-helpers';

const server = new NetworkTcpServer({
  identifier: 'echo-server',
  serverOptions: {},
  listenOptions: { port: 9000, host: '0.0.0.0' },
  authenticateOptions: { required: false },
  onClientData: ({ id, data }) => server.emit({ clientId: id, payload: data }),
});

const client = new NetworkTcpClient({
  identifier: 'echo-client',
  options: { host: 'localhost', port: 9000 },
  reconnect: true,
  maxRetry: 5,
  onData: ({ message }) => console.log('Echo:', message),
});

client.connect({ resetReconnectCounter: true });
client.emit({ payload: 'Hello, Server!' });
```

`NetworkTlsTcpServer`/`NetworkTlsTcpClient` use the identical API. Pass certificates in `serverOptions`/`options`, typed `TlsOptions`/`ConnectionOptions` from `node:tls`.

### Require TCP client authentication

Set `authenticateOptions.required: true` with a positive `duration` in milliseconds. The constructor throws if `duration` is missing or negative. Clients that never call `doAuthenticate()` within that window are disconnected automatically.

```typescript
const server = new NetworkTcpServer({
  identifier: 'auth-server',
  serverOptions: {},
  listenOptions: { port: 9000, host: '0.0.0.0' },
  authenticateOptions: { required: true, duration: 5000 },
  onClientData: ({ id, data }) => {
    if (data.toString() === 'secret-token') {
      server.doAuthenticate({ id, state: 'authenticated' });
    }
  },
});
```

### Send a UDP datagram

```typescript
import { NetworkUdpClient } from '@venizia/ignis-helpers';

const udpClient = NetworkUdpClient.newInstance({
  identifier: 'my-udp-client',
  port: 8081,
  host: '0.0.0.0',
  onData: ({ message, remoteInfo }) => {
    console.log(`From ${remoteInfo.address}:${remoteInfo.port}:`, message.toString());
  },
});

udpClient.connect();
udpClient.getClient()?.send('Hello', 5001, '239.1.2.3');
```

## See also

- [Full reference](/extensions/helpers/network/api) - every class, method signature, and type in the module
- [Redis helper](/extensions/helpers/redis/) - another `BaseHelper`-based connection helper with the same scoped-logging conventions

**Files:**

- [`packages/helpers/src/modules/network/http-request/base-network-request.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/base-network-request.helper.ts) - `BaseNetworkRequest`
- [`packages/helpers/src/modules/network/http-request/fetcher/node-fetcher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/fetcher/node-fetcher.ts) - `NodeFetcher`, `NodeFetchNetworkRequest`
- [`packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/http-request/fetcher/axios-fetcher.ts) - `AxiosFetcher`, `AxiosNetworkRequest` (sub-path export)
- [`packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/base-tcp-server.helper.ts) - `BaseNetworkTcpServer`
- [`packages/helpers/src/modules/network/tcp-socket/base-tcp-client.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/tcp-socket/base-tcp-client.helper.ts) - `BaseNetworkTcpClient`
- [`packages/helpers/src/modules/network/udp-socket/network-udp-client.helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/network/udp-socket/network-udp-client.helper.ts) - `NetworkUdpClient`
