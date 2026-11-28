---
title: Test a gRPC service
description: Boot the application in a test and call it over Connect and native gRPC
---

# Test a gRPC service

Boot the real application on free ports, call it with a real client, then stop it.

```typescript
// src/__tests__/greeter.test.ts
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { ControllerTransports } from '@venizia/ignis';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Application } from '../application';
import { GreeterService } from '../generated/greeter/v1/greeter_pb';

const application = new Application({
  scope: 'Application',
  config: {
    host: '127.0.0.1',
    port: 0,
    path: { base: '/api', isStrict: false },
    transports: [ControllerTransports.REST, ControllerTransports.GRPC],
  },
});

beforeAll(async () => {
  application.init();
  await application.start();
});

afterAll(async () => {
  await application.stop();
});

describe('GreeterService', () => {
  test('says hello', async () => {
    const transport = createConnectTransport({
      baseUrl: `http://127.0.0.1:${application.getServerPort()}/api/grpc`,
      httpVersion: '1.1',
    });

    const answer = await createClient(GreeterService, transport).sayHello({ name: 'Ada' });

    expect(answer.message).toBe('Hello, Ada!');
  });
});
```

```bash
bun test
```

## Call the native gRPC port in a test

Set `native: { use: true, port: 0 }` in the component options, then ask the listener for its port.

```typescript
import { createGrpcTransport } from '@connectrpc/connect-node';
import { getError } from '@venizia/ignis-helpers';
import { GrpcBindingKeys } from '@venizia/ignis/grpc';

const listener = application.get({ key: GrpcBindingKeys.GRPC_NATIVE_LISTENER });
const address = listener.getAddress();

if (!address) {
  throw getError({ message: 'The native gRPC port is not listening' });
}

const transport = createGrpcTransport({ baseUrl: `http://${address.host}:${address.port}` });
```

## Assert the error code of a failed call

```typescript
import { Code, ConnectError } from '@connectrpc/connect';

const [outcome] = await Promise.allSettled([client.getNote({ id: 'missing' })]);

expect(outcome.status).toBe('rejected');

if (outcome.status === 'rejected') {
  expect(ConnectError.from(outcome.reason).code).toBe(Code.Unauthenticated);
}
```

## What to cover

| Behaviour | How |
|---|---|
| Each RPC on the port your clients use | call over Connect, gRPC-Web or native |
| Refusals | no token, wrong permission, assert the code |
| Streams | read all messages; abort one mid-way |
| Deadlines | pass `timeoutMs` and expect `deadline_exceeded` |
| Boot only | [`ApplicationBootAssertion`](/guides/tutorials/testing#prove-the-application-boots): no socket, no calls |

The end-to-end test of [`examples/grpc-test`](https://github.com/VENIZIA-AI/ignis/tree/develop/examples/grpc-test) calls one application over all three protocols.
