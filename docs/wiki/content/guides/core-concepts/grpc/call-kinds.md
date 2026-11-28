---
title: gRPC call kinds and streaming
description: Unary, server stream, client stream and bidi handlers in an IGNIS gRPC controller
---

# gRPC call kinds: unary, server stream, client stream and bidi

Each RPC kind has a decorator and a handler shape. The kind must match the `.proto`.

## The four call kinds: unary, server stream, client stream, bidi

| Kind | Proto | Decorator | Handler | Application port | Native port |
|---|---|---|---|---|---|
| Unary | `rpc A(Req) returns (Res)` | `@unary` | returns the answer | yes | yes |
| Server stream | `returns (stream Res)` | `@serverStream` | async generator | yes | yes |
| Client stream | `rpc A(stream Req)` | `@clientStream` | reads `request`, returns one answer | yes | yes |
| Bidi stream | both `stream` | `@bidiStream` | reads `request`, yields answers | no (HTTP 505) | yes |

Every handler gets one object: `request`, `context` (the Hono context) and `rpc` (ConnectRPC's `HandlerContext`). Declare only the fields you read.

A decorator of the wrong kind, or an RPC name the service does not declare, stops the application at startup and lists the declared names. A method of the service that no handler implements is allowed.

## Unary RPC handler

```typescript
@unary({ configs: { name: 'sayHello' } })
async sayHello(opts: { request: SayHelloRequest; rpc: HandlerContext }) {
  opts.rpc.responseHeader.set('x-greeter', 'v2');   // metadata, before the answer
  opts.rpc.responseTrailer.set('x-cost', '3');      // trailers, after it

  return create(SayHelloResponseSchema, { message: `Hello, ${opts.request.name}!` });
}
```

Read request metadata with `rpc.requestHeader.get(name)`.

## Server streaming RPC handler

Write an async generator and `yield` each message. A handler that does not return an async iterable fails the call.

```typescript
@serverStream({ configs: { name: 'countDown' } })
async *countDown(opts: { request: CountDownRequest; rpc: HandlerContext }) {
  for (let value = opts.request.from; value > 0; value -= 1) {
    opts.rpc.signal.throwIfAborted();

    yield create(CountDownResponseSchema, { value });
  }
}
```

An error thrown after the first message ends the stream with its [code](/guides/core-concepts/grpc/errors).

## gRPC client stream handler

`request` is an async iterable. The handler sees each message as it arrives and returns one answer.

```typescript
@clientStream({ configs: { name: 'collect' } })
async collect(opts: { request: AsyncIterable<HelloRequest> }) {
  const names: string[] = [];

  for await (const message of opts.request) {
    names.push(message.name);
  }

  return create(SayHelloResponseSchema, { message: names.join(', ') });
}
```

A stream has no message count limit. Bound what you keep in memory, as you would for any upload.

## gRPC bidi stream handler

Read and answer in one generator. Bidi needs HTTP/2, so only the [native port](/guides/core-concepts/grpc/ports#turn-on-the-native-grpc-port) serves it.

```typescript
@bidiStream({ configs: { name: 'chat' } })
async *chat(opts: { request: AsyncIterable<HelloRequest> }) {
  for await (const message of opts.request) {
    yield create(SayHelloResponseSchema, { message: `Hello, ${message.name}` });
  }
}
```

## When a streaming client leaves

`rpc.signal` aborts and the generator is closed, so a `finally` in it runs. A reader that stops reading pauses the generator.

A handler that waits on something else (a queue, a notification) is not interrupted by itself. Pass `rpc.signal` to that wait:

```typescript
@serverStream({ configs: { name: 'watch' } })
async *watch(opts: { request: WatchRequest; rpc: HandlerContext }) {
  // your service stops waiting when the signal aborts
  for await (const event of this.eventService.watch({ signal: opts.rpc.signal })) {
    yield create(WatchResponseSchema, event);
  }
}
```

A stream that stays quiet can be cut by the idle timeout: see [deadlines and timeouts](/guides/core-concepts/grpc/deadlines-and-timeouts#idle-timeout).
