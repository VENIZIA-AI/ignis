---
title: Build a gRPC service
description: Add a gRPC service to an IGNIS application, from a proto file to the first call
---

# Build a gRPC service

You write a `.proto` file, generate TypeScript from it, add one controller, and call it. The example serves a unary call and a server stream with [ConnectRPC](https://connectrpc.com/).

Start from a running IGNIS application ([5-minute quickstart](/guides/get-started/5-minute-quickstart)).

## 1. Install the gRPC packages

`@connectrpc/connect` is an optional peer of IGNIS, so you add it yourself.

```bash
bun add @connectrpc/connect @bufbuild/protobuf
bun add @connectrpc/connect-node          # Node clients, and the native gRPC port
bun add -d @bufbuild/buf @bufbuild/protoc-gen-es
```

## 2. Write the proto file

```protobuf
// proto/greeter/v1/greeter.proto
syntax = "proto3";

package greeter.v1;

service GreeterService {
  rpc SayHello(SayHelloRequest) returns (SayHelloResponse);
  rpc CountDown(CountDownRequest) returns (stream CountDownResponse);
}

message SayHelloRequest {
  string name = 1;
}

message SayHelloResponse {
  string message = 1;
}

message CountDownRequest {
  int32 from = 1;
}

message CountDownResponse {
  int32 value = 1;
}
```

## 3. Generate TypeScript from the proto

Add two config files at the project root.

```yaml
# buf.yaml
version: v2
modules:
  - path: proto
```

```yaml
# buf.gen.yaml
version: v2
clean: true
plugins:
  - local: protoc-gen-es
    out: src/generated
    opt:
      - target=ts
```

Add the script `"proto:gen": "buf generate"` to `package.json`, then run it:

```bash
bun run proto:gen    # writes src/generated/greeter/v1/greeter_pb.ts
```

## 4. Write the service

Business logic goes in an ordinary service.

```typescript
// src/greeter.service.ts
import { BaseService } from '@venizia/ignis';

export class GreeterService extends BaseService {
  constructor() {
    super({ scope: GreeterService.name });
  }

  greet(opts: { name: string }) {
    return `Hello, ${opts.name}!`;
  }
}
```

## 5. Write the gRPC controller

`@controller` takes the generated service descriptor. Each method decorator names one RPC as the generated code spells it: `sayHello` for `rpc SayHello`.

```typescript
// src/greeter.controller.ts
import { create } from '@bufbuild/protobuf';
import type { HandlerContext } from '@connectrpc/connect';
import {
  BaseGrpcController,
  controller,
  ControllerTransports,
  inject,
  serverStream,
  unary,
} from '@venizia/ignis';
import {
  CountDownResponseSchema,
  GreeterService as GreeterDefinition,
  SayHelloResponseSchema,
  type CountDownRequest,
  type SayHelloRequest,
} from './generated/greeter/v1/greeter_pb';
import { GreeterService } from './greeter.service';

@controller({ path: '/grpc', transport: ControllerTransports.GRPC, service: GreeterDefinition })
export class GreeterController extends BaseGrpcController {
  constructor(@inject({ target: GreeterService }) private readonly greeterService: GreeterService) {
    super({ scope: GreeterController.name });
  }

  override binding() {}

  @unary({ configs: { name: 'sayHello' } })
  async sayHello(opts: { request: SayHelloRequest }) {
    const message = this.greeterService.greet({ name: opts.request.name });

    return create(SayHelloResponseSchema, { message });
  }

  @serverStream({ configs: { name: 'countDown' } })
  async *countDown(opts: { request: CountDownRequest; rpc: HandlerContext }) {
    for (let value = opts.request.from; value > 0; value -= 1) {
      opts.rpc.signal.throwIfAborted();

      yield create(CountDownResponseSchema, { value });
    }
  }
}
```

The descriptor is a value, not a type. Alias it (`GreeterDefinition`) so it does not collide with your service class.

These two RPCs are public. Add [authentication](/guides/core-concepts/grpc/authentication) before you expose anything real.

## 6. Turn on the gRPC transport

Register both classes and add `GRPC` to `transports`. The default is REST only.

```typescript
// src/application.ts
import { BaseApplication, type IApplicationInfo } from '@venizia/ignis';
import { GreeterController } from './greeter.controller';
import { GreeterService } from './greeter.service';

export class Application extends BaseApplication {
  override getAppInfo(): IApplicationInfo {
    return { name: 'greeter', version: '1.0.0', description: 'A gRPC service' };
  }

  override staticConfigure() {}

  override preConfigure() {
    this.service(GreeterService);
    this.controller(GreeterController);
  }

  override postConfigure() {}

  override setupMiddlewares() {}
}
```

```typescript
// src/index.ts
import { ControllerTransports } from '@venizia/ignis';
import { Application } from './application';

const application = new Application({
  scope: 'Application',
  config: {
    host: '127.0.0.1',
    port: 3000,
    path: { base: '/api', isStrict: false },
    transports: [ControllerTransports.REST, ControllerTransports.GRPC],
  },
});

application.init();
await application.start();
```

```bash
bun src/index.ts
```

## 7. Make the first gRPC call

The RPC lives at `{base path}{controller path}/{package}.{Service}/{Method}`. A unary call needs only `curl`:

```bash
curl -X POST http://127.0.0.1:3000/api/grpc/greeter.v1.GreeterService/SayHello \
  -H 'content-type: application/json' -d '{"name":"Ada"}'
# {"message":"Hello, Ada!"}
```

A generated client is typed, and reads streams:

```typescript
// src/client.ts
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { GreeterService } from './generated/greeter/v1/greeter_pb';

const transport = createConnectTransport({
  baseUrl: 'http://127.0.0.1:3000/api/grpc',
  httpVersion: '1.1',
});
const client = createClient(GreeterService, transport);

const { message } = await client.sayHello({ name: 'Ada' });
console.log(message);

for await (const { value } of client.countDown({ from: 3 })) {
  console.log(value);
}
```

```bash
bun src/client.ts
```

`grpcurl`, grpc-go and other native gRPC clients get `415` on this port. Turn on the [native gRPC port](/guides/core-concepts/grpc/ports#turn-on-the-native-grpc-port) for them.

## Next steps

| You want to | Read |
|---|---|
| Choose a port and a protocol | [gRPC ports and protocols](/guides/core-concepts/grpc/ports) |
| Write client and bidi streams | [gRPC call kinds](/guides/core-concepts/grpc/call-kinds) |
| Require a token or a permission | [gRPC authentication](/guides/core-concepts/grpc/authentication) |
| Set limits | [gRPC configuration](/guides/core-concepts/grpc/configuration) |
| Handle deadlines | [gRPC deadlines and timeouts](/guides/core-concepts/grpc/deadlines-and-timeouts) |
| Test it | [Test a gRPC service](/guides/core-concepts/grpc/testing) |

A complete application with all four call kinds is in [`examples/grpc-test`](https://github.com/VENIZIA-AI/ignis/tree/develop/examples/grpc-test).
