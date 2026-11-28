---
title: Native gRPC port TLS
description: TLS and clear text h2c on the native gRPC port
---

# Native gRPC port TLS

TLS is an option of the native gRPC port. Pass a PEM key and certificate.

```typescript
import { readFileSync } from 'node:fs';
import { GrpcBindingKeys } from '@venizia/ignis/grpc';

this.bind({ key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS }).toValue({
  native: {
    use: true,
    port: 50051,
    host: '0.0.0.0',
    tls: {
      use: true,
      key: readFileSync('./certs/server.key'),
      cert: readFileSync('./certs/server.crt'),
    },
  },
});
```

| Setting | Behaviour |
|---|---|
| `tls: { use: true, key, cert }` | TLS, HTTP/2 only |
| `tls: { use: false }` or absent | clear text HTTP/2 (h2c) |
| h2c on a host that is not loopback | allowed; one info line in the log. Put a service mesh or a TLS proxy in front |

The key and certificate are read when the port starts. Restart the application to rotate them. Client certificates (mTLS) are not supported.

## TLS on the application port

IGNIS passes no TLS setting to `Bun.serve`, so Connect and gRPC-Web are plain HTTP there. Terminate TLS at a reverse proxy or load balancer.

## Make a certificate for local development

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -keyout certs/server.key -out certs/server.crt \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
```

## Connect a client over TLS

A client trusts your self-signed certificate only if you give it.

```typescript
import { readFileSync } from 'node:fs';
import { createGrpcTransport } from '@connectrpc/connect-node';

const transport = createGrpcTransport({
  baseUrl: 'https://localhost:50051',
  nodeOptions: { ca: readFileSync('./certs/server.crt') },
});
```

```bash
grpcurl -cacert certs/server.crt -import-path proto -proto greeter/v1/greeter.proto \
  -d '{"name":"Ada"}' localhost:50051 greeter.v1.GreeterService/SayHello
```
