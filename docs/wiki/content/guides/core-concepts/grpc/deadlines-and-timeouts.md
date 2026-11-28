---
title: gRPC deadlines, cancellation and idle timeouts
description: Deadlines, cancellation, streaming and idle timeouts of gRPC calls in IGNIS
---

# gRPC deadlines, cancellation and idle timeouts

A deadline limits how long a client waits. An idle timeout closes a call that stays quiet. IGNIS sets no deadline of its own.

| Limit | Set by | Applies to |
|---|---|---|
| Deadline | the client, per call | the whole call, streams included |
| Cancellation | the client leaving | the whole call |
| Idle timeout | `server.idleTimeout` | a quiet public call |
| Shutdown timeout | `native.shutdownTimeout` | calls running at [shutdown](/guides/core-concepts/grpc/shutdown) |

## gRPC streaming deadline

The client sets a deadline with `timeoutMs`. It covers the whole stream, not each message.

```typescript
for await (const message of client.countDown({ from: 10 }, { timeoutMs: 5_000 })) {
  console.log(message.value);
}
```

On the server, `rpc.signal` aborts at the deadline and `rpc.timeoutMs()` gives the milliseconds left (`undefined` without a deadline).

## Honour the deadline in a handler

A deadline is a signal, not a kill: a handler that ignores `rpc.signal` runs on and answers, although the client has given up. Pass the signal to slow work, and check it before work worth skipping.

```typescript
@unary({ configs: { name: 'getReport' } })
async getReport(opts: { request: ReportRequest; rpc: HandlerContext }) {
  const response = await fetch(this.reportUrl, { signal: opts.rpc.signal });
  opts.rpc.signal.throwIfAborted();

  return create(ReportResponseSchema, { body: await response.text() });
}
```

A handler that stops because of the signal answers `deadline_exceeded`.

## Client cancellation

When a client cancels or disconnects, `rpc.signal` aborts, and a streaming generator is closed so its `finally` runs.

```typescript
const abort = new AbortController();
const stream = client.countDown({ from: 100 }, { signal: abort.signal });
// later
abort.abort();
```

## Idle timeout

The idle timeout closes a call during which nothing is sent or received for too long. It is `server.idleTimeout`, 10 seconds by default, on both ports.

| Call | Idle timeout |
|---|---|
| passed `authenticate` or `authorize` | lifted: it may stay quiet as long as the handler needs |
| refused, or still without credentials | kept |
| public method (no `authenticate` strategy and no `authorize`) | kept |

A lifted call ends with the client's deadline, the client leaving, or the handler. Send a deadline from clients, and pass `rpc.signal` to slow work. After the call, the connection has the idle timeout again.

A call whose `authenticate` was skipped with `Authentication.SKIP_AUTHENTICATION` counts as passed.

## Quiet public streams

Prefer `authenticate` for a long-lived stream. For a public one, raise `server.idleTimeout` far enough:

- native port: above the longest quiet gap
- application port: at least 5, **and** more than 4 seconds above the longest quiet gap. See [Bun limits](/guides/core-concepts/grpc/bun-limits#quiet-server-streams-are-cut)

```typescript
config: { server: { idleTimeout: 60 } }   // public stream with gaps well under 56 s
```

A public unary method that computes silently longer than the timeout is cut as well.

## Large answers to slow clients

The connection gets its idle timeout back as the call ends. A client that stops reading a large unary answer for longer than that may lose its tail, as for a REST answer.
