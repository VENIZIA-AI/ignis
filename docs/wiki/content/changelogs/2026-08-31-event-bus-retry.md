---
title: EventBus Retry Gets Jitter, a Bounded Per-Registration Window, and a Tagged Handler Reference
description: EventBus retries now jitter every backoff delay, let each registration tune its own bounded retry window, and take handler as a tagged binding-key-or-function reference instead of a bare handlerBindingKey string.
---

# Changelog - 2026-08-31

## EventBus retry and handler reference

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `EventBus` retries now jitter, each `register()` call can set its own bounded retry window, and `handler` replaces `handlerBindingKey` with a tagged reference that also accepts a plain function.

## What changed

- **Every retry delay is jittered.** `RetryJitterModes.FULL` is applied to every dispatch retry, with no way to turn it off.
- **Retry timing is now per registration.** `register()` takes an optional `retry: { maxAttempts, baseDelayMs }`. Omit it and behavior is unchanged from before, aside from the jitter.
- **Both retry numbers are bounded, and a value over the bound throws at `register()`.** There is no silent clamp.
- **`handler` replaces `handlerBindingKey`.** It is a tagged reference: a container binding key, or a plain function.
- **A handler may now return `void` synchronously**, not only a `Promise<void>`.

## Why the jitter

Picture 23 handlers all retrying the same lock. Fixed backoff makes every one of them wake up at exactly 100ms, then exactly 300ms - colliding on the shared row lock a second time, at the same instant, right after the first collision. Each round makes the contention worse, not better.

`RetryJitterModes.FULL` picks a uniform random delay in `[0, delay)` instead of using `delay` itself. Twenty-three handlers racing the same lock now wake up spread across a window instead of in lockstep, so the herd stops re-forming. `EQUAL` (`delay/2` plus jitter) was the other option, but it still guarantees a delay floor, which keeps some of the pileup. `FULL` decorrelates it hardest, so it is the only mode used, and it's on for every dispatch - there is no setting to turn it off, because it has no downside against a shared resource.

## Why a bounded per-registration window

The old fixed 3 attempts / 100ms base was invented, not measured, and it does not fit every handler. A handler retrying a transient lock might need 5 attempts over several seconds. A handler doing something less recoverable might want 1.

But `EventBus` is fire-and-forget: nothing awaits a dispatch, so an unbounded retry window can hold a handler - and whatever it holds open, like a database connection - for minutes with nobody watching. `register()` now enforces two ceilings and rejects a value beyond either, loudly, at startup:

| Ceiling | Value | Why |
|---|---|---|
| `maxAttempts` | 10 | Twice the highest attempt count any known caller has asked for, enough room to tune without permitting an attempt storm. |
| Total backoff window | 30,000ms | Matches `RetryHelper`'s own default cap on a single delay - a dispatch holding a handler's resources for longer than that is the case this bound exists to catch. |

The total window is the sum of every inter-attempt delay the exponential backoff would produce, computed without jitter (jitter only ever shrinks a delay, so this is the true worst case). `maxAttempts: 6` with `baseDelayMs: 2000` is a legal attempt count on its own, but its window sums past 30 seconds and is rejected - the two ceilings are checked independently.

## What each handler shape means for a rebind

`handler` is now a tagged union instead of a bare string. The tag makes the caller's choice explicit at the call site instead of implicit in whichever field is present, so pairing the wrong field with a `type` - `BINDING_KEY` with `fn`, or `FUNCTION` with `key` - is a compile error there, rather than a runtime surprise later inside a `queueMicrotask` where nobody is watching.

```typescript
type: EventHandlerTypes.BINDING_KEY, key: string
type: EventHandlerTypes.FUNCTION,    fn: (opts: { event }) => ValueOrPromise<void>
```

The two forms behave differently on a rebind, and that difference is the reason to pick one over the other:

- **`BINDING_KEY`** resolves `key` from the container on every retry attempt. Rebind the key mid-dispatch and the very next attempt - even one already in flight - uses the new binding.
- **`FUNCTION`** captures `fn` as a closure at `register()` time. There is nothing to rebind: every attempt in the retry window calls the exact function registered at startup.

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

A handler with no dependencies can skip the container entirely:

```typescript
eventBus.register({
  name: 'orderPlaced',
  handler: {
    type: EventHandlerTypes.FUNCTION,
    fn: async ({ event }) => logger.info('Order placed: %s', event.payload.orderId),
  },
});
```

## Who is affected

- **Any caller of `EventBus.register()`.** Wrap the existing binding key in `{ type: EventHandlerTypes.BINDING_KEY, key }`. No other behavior changes for that shape, aside from jitter.
- **A handler that relies on a fixed 300ms total retry window.** The window is unchanged by default, but is now overridable - set `retry` explicitly if the timing itself was load-bearing.
- **`IEventHandler` implementers.** `handle` may now return `void` synchronously as well as `Promise<void>` - every existing `async handle()` implementation still satisfies the interface unchanged.

## A trap in the payload map, worth reading before you trust the types

`EventBus`'s only type safety is `K extends keyof TPayloadMap & string` - it is exactly as strong as
the map you hand it. A map built from computed keys off a **plain object literal** silently degrades
to an index signature:

```typescript
const EVENT_NAMES = { ORDER_PLACED: 'order.placed' };        // no `as const`

interface IPayloadMap {
  [EVENT_NAMES.ORDER_PLACED]: IOrderPlacedPayload;
}
```

Without `as const`, `EVENT_NAMES.ORDER_PLACED` has type `string`, not the literal
`'order.placed'`. A computed key of type `string` produces an **index signature**, so `IPayloadMap`
accepts every event name and `keyof IPayloadMap` is `string`. `register()` and `publish()` then
take any name at all.

> [!WARNING]
> This compiles cleanly and looks type-safe at every call site. Nothing reports it - not `tsc`, not
> lint, not a test. The bus appears to be checking names and is not.

**The fix is `as const`.** A `static readonly` on a class keeps its literal type too, which is why
one map in a codebase can be sound while its neighbour silently is not, for a reason invisible where
they are used.

**How to check yours** - a control line, because the defect is the absence of an error:

```typescript
// @ts-expect-error a name nobody declared must not resolve
type Control = IPayloadMap['nothing.declares.this'];
```

If `tsc` reports that directive as **unused**, the map has degraded - the bogus key resolved. If it
reports nothing, the map is sound. Pinned in `kernel/src/__tests__/events/payload-map-typing.test.ts`.

## Details

- A synchronous handler that throws is retried exactly like an asynchronous one: `dispatch`'s own `execution` callback is `async`, so a synchronous throw inside it becomes a rejected promise the same way `RetryHelper.executeWithRetry` already handles.
- The exhaustion log line now names the handler shape (`binding-key:<key>` or `function:<name>`) instead of always assuming a binding key.
- The class doc comment no longer claims a fixed retry window makes "'published' guarantee the same thing at every call site" - that stopped being true once retry became configurable. What the bus guarantees instead is a bounded maximum time a single dispatch can occupy, enforced by the two ceilings above.

| File | Package |
|------|---------|
| `src/base/events/event-bus.ts` | kernel |
| `src/base/events/common/types.ts` | kernel |
| `src/base/events/common/constants.ts` | kernel |
