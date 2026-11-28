---
title: gRPC ports and protocols
description: The application port and the native gRPC port, and which protocol each client should use
---

# gRPC ports and protocols

One set of controllers answers on up to two ports. The application port serves Connect and gRPC-Web. The optional native port serves gRPC, and is off by default.

| | Application port | Native gRPC port |
|---|---|---|
| Server | `Bun.serve`, with REST routes | `node:http2` listener |
| Protocols | Connect, gRPC-Web | gRPC only |
| HTTP version | 1.1 | 2 |
| RPC path | `{base}{controller path}/pkg.Service/Method` | `/pkg.Service/Method` |
| Call kinds | unary, server stream, client stream | all four, bidi included |
| TLS | not configured by IGNIS: use a proxy | [`native.tls`](/guides/core-concepts/grpc/tls) |
| Default | on | off |

## Which protocol to choose: Connect, gRPC-Web or gRPC

| Client | Protocol | Port |
|---|---|---|
| Browser | Connect, or gRPC-Web | application |
| TypeScript service | Connect, or gRPC | either |
| `curl`, quick checks | Connect (plain JSON, unary) | application |
| grpc-go, grpc-java, `@grpc/grpc-js`, `grpcurl` | gRPC | native |
| Existing gRPC-Web client | gRPC-Web | application |
| Anything that needs bidi | gRPC | native |

A browser cannot stream a request body: from a browser only unary and server streaming work.

## Connect and gRPC-Web clients on the application port

Both use the base URL up to the controller path.

```bash
bun add @connectrpc/connect-web
```

```typescript
import { createClient } from '@connectrpc/connect';
import { createConnectTransport, createGrpcWebTransport } from '@connectrpc/connect-web';
import { GreeterService } from './generated/greeter/v1/greeter_pb';

const baseUrl = 'http://127.0.0.1:3000/api/grpc';

const connectClient = createClient(GreeterService, createConnectTransport({ baseUrl }));
const grpcWebClient = createClient(GreeterService, createGrpcWebTransport({ baseUrl }));
```

A page on another origin also needs CORS: set `middlewares.cors` in the [application config](/references/base/middlewares). The CORS middleware answers the preflight of an RPC route.

## Turn on the native gRPC port

`Bun.serve` sends no response trailers, which gRPC needs, so native clients get their own port. Add the peer and set `native`.

```bash
bun add @connectrpc/connect-node
```

```typescript
import { GrpcBindingKeys } from '@venizia/ignis/grpc';

// in preConfigure()
this.bind({ key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS }).toValue({
  native: { use: true, port: 50051 },   // listens on 127.0.0.1, clear text
});
```

To serve other machines, set `host` and read [gRPC TLS](/guides/core-concepts/grpc/tls). Every option is in [gRPC configuration](/guides/core-concepts/grpc/configuration).

## Call the native gRPC port

Clients call `/pkg.Service/Method` with no base or controller path.

```typescript
import { createClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { GreeterService } from './generated/greeter/v1/greeter_pb';

const client = createClient(
  GreeterService,
  createGrpcTransport({ baseUrl: 'http://127.0.0.1:50051' }),
);
```

The server has no reflection or health service. Give `grpcurl` the `.proto`:

```bash
grpcurl -plaintext -import-path proto -proto greeter/v1/greeter.proto \
  -d '{"name":"Ada"}' 127.0.0.1:50051 greeter.v1.GreeterService/SayHello
```

## What the native gRPC port serves

| Topic | Rule |
|---|---|
| Routes | RPC paths only, with POST. A REST route is not reachable |
| Two controllers of one service | the boot fails: the path has one owner |
| Global middleware | runs with the headers only: it reads no body, and cannot change an answer after `next()` |
| A global middleware that answers | a [mapped code](/guides/core-concepts/grpc/errors#when-a-middleware-answers-before-the-rpc), with headers |
| Client address | `getConnInfo` from `hono/bun` answers it |
| Bound port | with `port: 0`, read it from [`getAddress()`](/guides/core-concepts/grpc/testing#call-the-native-grpc-port-in-a-test) |
