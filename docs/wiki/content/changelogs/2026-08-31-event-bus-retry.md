---
title: EventBus Retry Gets Jitter, a Bounded Per-Registration Window, and a Tagged Handler Reference
description: EventBus retries now jitter every delay, each registration can set its own bounded retry window, and handler replaces handlerBindingKey with a tagged reference that also accepts a function.
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-08-31

## EventBus retry and handler reference

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `EventBus` retries now jitter, each `register()` call can set its own bounded retry window, and `handler` replaces `handlerBindingKey` with a tagged reference that also accepts a plain function.

## What changed

- **Every retry delay is jittered** (`RetryJitterModes.FULL`), with no way to turn it off.
- **Retry timing is per registration.** `register()` takes an optional `retry: { maxAttempts, baseDelayMs }`. Omit it and behavior is unchanged apart from the jitter.
- **Both retry numbers are bounded.** `maxAttempts` is at most 10, and the total backoff window (the sum of every inter-attempt delay, without jitter) is at most 30,000ms. A value over either bound throws at `register()`; nothing is clamped silently. For example, `maxAttempts: 6` with `baseDelayMs: 2000` is rejected because its window passes 30 seconds.
- **`handler` replaces `handlerBindingKey`.** It is a tagged reference: a container binding key, or a plain function.
- **A handler may return `void` synchronously**, not only `Promise<void>`. A synchronous throw is retried like an asynchronous one.

## Who is affected

- **Any caller of `EventBus.register()`.** Wrap the existing binding key as shown below. No other behavior changes for that shape, apart from jitter.
- **A handler that relied on the fixed retry window.** The default window is unchanged, but it is now overridable. Set `retry` explicitly if the timing mattered.
- **`IEventHandler` implementers.** Every existing `async handle()` still satisfies the interface.

## Breaking changes

> [!WARNING]
> `register()`'s `handlerBindingKey` field is removed, not aliased. Update every call site.

**Before:**

```typescript
eventBus.register({
  name: 'orderPlaced',
  handlerBindingKey: 'services.OrderPlacedHandler',
});
```

**After:**

```typescript
eventBus.register({
  name: 'orderPlaced',
  handler: { type: EventHandlerTypes.BINDING_KEY, key: 'services.OrderPlacedHandler' },
});
```

A handler with no dependencies can skip the container:

```typescript
eventBus.register({
  name: 'orderPlaced',
  handler: {
    type: EventHandlerTypes.FUNCTION,
    fn: async ({ event }) => logger.info('Order placed: %s', event.payload.orderId),
  },
});
```

Pairing the wrong field with a `type` (`BINDING_KEY` with `fn`, or `FUNCTION` with `key`) is a compile error.

## Details

- **`BINDING_KEY`** resolves `key` from the container on every retry attempt, so a rebind is picked up by the next attempt.
- **`FUNCTION`** captures `fn` at `register()` time, so every attempt calls the function registered at startup.
- **Payload maps need `as const`.** A payload map built from computed keys off a plain object literal (no `as const`) degrades to an index signature, so `register()` and `publish()` accept any event name. Nothing reports it. Use `as const` (or a `static readonly` class member). To check a map, add a control line; if `tsc` reports the directive as unused, the map has degraded:

```typescript
// @ts-expect-error a name nobody declared must not resolve
type Control = IPayloadMap['nothing.declares.this'];
```
