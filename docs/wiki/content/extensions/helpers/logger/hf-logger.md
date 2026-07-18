---
title: HfLogger - High-Frequency Logging Guide
description: How to use the ring-buffer HfLogger correctly - setup, the ILogger surface, hot-path cost model, flusher lifecycle, and the limitations you must design around.
difficulty: advanced
---

# HfLogger - High-Frequency Logging Guide

`HfLogger` is a fixed-layout ring-buffer logger for hot paths where even the standard `Logger` is too expensive. A log call writes a 256-byte binary entry into a lazily-allocated buffer - no string formatting, no transport I/O, no per-call allocation on the fast path - and a separate `HfLogFlusher` drains entries later, off the hot path.

It implements `ILogger` (`AbstractLogger`), so it is a drop-in replacement anywhere an `ILogger` is expected - a direct method for every level (`debug`, `info`, `warn`, `error`, `emerg`), plus `log` and `for`, all work. It is still entirely separate from the Winston-backed `Logger` pipeline: no formatters, no transports, no `APP_ENV_LOGGER_*` variables apply to it. It trades that pipeline away for enqueue speed - measured at 59.4ns/op on the bytes path and 66.0ns/op on the string no-args path on a modern machine (Bun 1.3.14, 1M-iteration median), against 831ns/op for pino writing to `/dev/null` on the same machine - roughly 14x faster.

> [!IMPORTANT]
> Reach for `HfLogger` only when a profiler shows logging itself in your hot path - order engines, market-data ticks, per-packet paths at 100k+ events/sec. For everything else, the standard scoped `Logger` is the right tool: it formats, redacts, rotates files, and ships UDP. Most services never need this module.

## Mental model

One ring buffer per process holds 65,536 entries of 256 bytes each (16MB), allocated lazily on the first `HfLogger.get()` call - not at module import. Writers stamp entries in; the ring never blocks and never grows. When the ring is full, the NEXT write overwrites the OLDEST entry - the buffer trades completeness for a bounded, allocation-free hot path, and the flusher now counts and reports every entry it overwrites before it could be read (see "Lap accounting" below).

**Entry layout (256 bytes):**

| Offset | Size | Field |
|--------|------|-------|
| 0-7 | 8 bytes | Timestamp (`float64` epoch milliseconds, sub-millisecond precision) |
| 8 | 1 byte | Level (`0`=debug, `1`=info, `2`=warn, `3`=error, `4`=emerg) |
| 9 | 1 byte | Scope length (0-32) |
| 10-41 | 32 bytes | Scope bytes |
| 42 | 1 byte | Message length (0-213) |
| 43-255 | 213 bytes | Message bytes |

The two length bytes are what make reads exact: the flusher decodes only the bytes a field actually holds, never the fixed-width remainder, so there is no NUL padding and no stale tail leaking from whatever a reused slot last held. Because entries are fixed-width binary, everything you log must fit the layout: scopes at most 32 bytes, messages at most 213 bytes. Anything longer is truncated, not rejected.

## Setup - everything happens at initialization time

The hot path takes pre-encoded bytes, not strings. Encode once, at startup, and keep the references:

```typescript
import { HfLogger, HfLogFlusher } from '@venizia/ignis-helpers';

// -- Initialization phase (once, before any hot path runs) --

// 1. Get the logger for a scope (cached; scope bytes are pre-computed)
const orderLogger = HfLogger.get('OrderEngine');

// 2. Pre-encode EVERY message the hot path will ever emit
const MSG_ORDER_SENT = HfLogger.encodeMessage('Order sent');
const MSG_ORDER_FILLED = HfLogger.encodeMessage('Order filled');
const MSG_ORDER_REJECTED = HfLogger.encodeMessage('Order rejected');

// 3. Start the background flusher
const flusher = new HfLogFlusher();
flusher.start(100); // drain every 100ms
```

```typescript
// -- Hot path (bytes path, ~59ns/call) --
orderLogger.log('info', MSG_ORDER_SENT);
orderLogger.log('info', MSG_ORDER_FILLED);
orderLogger.log('error', MSG_ORDER_REJECTED);
```

```typescript
// -- Or drain manually (e.g. at a batch boundary or before shutdown) --
await flusher.flush();

// -- And stop the interval when the logger is no longer needed --
flusher.stop();
```

## The ILogger surface - and its cost model

`HfLogger` implements the same `ILogger` methods as the standard `Logger`, so it can be typed and passed around as `ILogger`. But each method sits on a different point of the cost curve, and picking the right one is the whole point of this module:

```typescript
import { HfLogger } from '@venizia/ignis-helpers';
import type { ILogger } from '@venizia/ignis-helpers';

const logger: ILogger = HfLogger.get('OrderEngine');

// Fast: no-args string call resolves through the same bounded encode cache as
// encodeMessage() - a Map.get() plus the bytes-path write. ~66ns/call on a cache hit.
logger.info('Order sent');

// Slow path: any args force formatLogMessage() (deep inspection + secret redaction)
// and an UNCACHED encode, because dynamic strings must never grow the cache.
// Correct, but this is not the hot path - use it for control-flow events, not per-tick data.
logger.info('Order sent: %s', orderId);

// debug() returns before any encoding when SHOULD_LOG_DEBUG is false (same gate as Logger).
logger.debug('Verbose diagnostic');

// .for() composes a sub-scope the same way BaseLogger does.
const fillLogger = logger.for('fill');
fillLogger.info('Order filled');

// log() also accepts pre-encoded bytes directly - the true hot path, unchanged from before.
const MSG_ORDER_SENT = HfLogger.encodeMessage('Order sent');
logger.log('info', MSG_ORDER_SENT);
```

Rule of thumb: pre-encode and call the bytes overload for anything on a per-event, per-tick, per-packet path. Reach for the no-args string call when the message is a small fixed set of facts you did not think to pre-encode. Reach for the args form only off the true hot path - it is correct (nothing is ever silently dropped), just not free.

## The rules that keep it fast and correct

**1. Never encode in the hot path.** `HfLogger.encodeMessage` (and the no-args string call, which shares the same cache) remembers every distinct string it sees. The cache is FIFO-bounded at 4096 entries - calling it with dynamic strings (`encodeMessage('order ' + id)`) still puts UTF-8 encoding on your hot path and now evicts the oldest cached message once you cross the cap, corrupting the fixed vocabulary you rely on elsewhere. If a value varies per event, it does not belong in an `HfLogger` message; log the static fact here and the variable detail through the standard `Logger` at a lower frequency, or use the args form off the hot path.

**2. A fixed vocabulary of messages.** The design point of the bytes path is a finite set of pre-encoded facts ("Order sent", "Tick received", "Risk check failed"). If you find yourself needing free-form text on the hot path, you are in the wrong module - or you want the args form, off the hot path.

**3. Size the flush interval against your write rate.** The ring holds 65,536 entries. If more entries than that are written between two flushes, the oldest unflushed entries are overwritten - and the flusher now reports exactly how many via `dropped` on the sink batch (see below) instead of silently emitting stale data. Pick the interval so that `writeRate x interval < 65,536` with comfortable margin: at 100k logs/sec, a 100ms interval accumulates ~10k entries per drain - safe; at 1M logs/sec you need ~30ms or faster.

**4. One process, one thread.** `HfLogger` is safe only on a single thread within a single process - the write index is a plain counter, not shared or atomic. Do not log to it from worker threads; each worker importing the module gets its own independent ring, and nothing coordinates them. This is a documented design point, not an accident.

**5. Flush before shutdown.** Entries live only in memory. An exiting process loses everything not yet flushed - call `await flusher.flush()` in your shutdown path, and `flusher.stop()` to clear the interval.

## The flusher

```typescript
import { HfLogFlusher } from '@venizia/ignis-helpers';
import type { IHfLogFlusherOptions } from '@venizia/ignis-helpers';

// Default: renders to stdout, one write() per batch of up to 1024 entries.
const flusher = new HfLogFlusher();

// Append to a file instead of stdout.
const fileFlusher = new HfLogFlusher({ filePath: './app_data/hf.log' });

// Full custom delivery - receives the rendered lines AND the drop count for this batch.
const customFlusher = new HfLogFlusher({
  sink: batch => {
    if (batch.dropped > 0) {
      console.warn(`HfLogFlusher lapped: ${batch.dropped} entries overwritten`);
    }
    shipToAggregator(batch.lines);
  },
  batchSize: 512,
});

flusher.start(100); // interval-based draining, unref'd so it never blocks process exit
await flusher.flush(); // one-shot drain, e.g. before shutdown
flusher.stop(); // clears the interval; start() again to resume
```

A rendered line looks like this:

```
2026-07-18T09:41:03.128Z [info] OrderEngine Order sent
```

`<ISO timestamp> [<level name>] <scope> <message>` - readable, parseable, and free of NULs or stale bytes.

### Lap accounting

Every batch the flusher hands to its sink carries `dropped: number` - the count of entries overwritten by the ring before the flusher could read them since the previous batch. The default sink emits a `warn` marker line ahead of the batch when `dropped > 0`:

```
2026-07-18T09:41:03.200Z [warn] HfLogFlusher ring lapped - 342 entries overwritten before they could be read
```

A custom `sink` gets the same `dropped` count on `batch.dropped` and decides how to surface it. This replaces the old silent behavior where a lapped ring simply emitted whatever currently sat in each slot.

## Current limitations

These are real behaviors of the current implementation - design around them:

- **Single-thread only.** The write index is not shared or atomic across threads; each worker thread importing the module gets an independent ring. Do not log to `HfLogger` from worker threads expecting a shared buffer.
- **The ring overwrites the oldest entry when lapped.** If the producer writes faster than the flusher drains (rule 3 above), unflushed entries are silently overwritten in memory - but the flusher now counts and reports every one of them via `dropped`, so the loss is visible rather than invisible.
- **213-byte message cap, 32-byte scope cap.** Both are truncation-only - a longer value is cut, not rejected. The truncation is a byte-boundary cut, not a character-boundary one, so it can split a multibyte UTF-8 character - the truncated tail then renders as the U+FFFD replacement character.
- **Run one flusher per process.** Each `HfLogFlusher` tracks its own read position from the start of the ring, not a shared cursor - a second flusher re-emits entries the first one already drained.
- **A fixed, pre-encoded vocabulary is still the right pattern for the bytes path.** `HfLogger.encodeMessage` / the no-args string call exist to make the ENCODE cost a one-time expense; the args form is correct but is the slow path by design.
- **The encode cache is FIFO-bounded at 4096 entries.** Well within a real fixed vocabulary, but a hot path that generates many distinct dynamic strings through the no-args string call will start evicting and re-encoding.

## Performance characteristics

Measured on Bun 1.3.14, 1M-iteration median:

| Path | Cost | Notes |
|------|------|-------|
| Bytes (`log(level, preEncodedBytes)`) | 59.4ns/op | The true hot path - no formatting, no allocation |
| String, no args (`info('Order sent')`) | 66.0ns/op | Cache-hit encode lookup + bytes-path write |
| pino, sync, `/dev/null` | 831ns/op | ~14x slower than the `HfLogger` bytes path on the same machine |

Heap growth measured at 0.0MB over 1M bytes-path logs - the hot path does not allocate. That buys an ENQUEUE, not a durable log line; the flusher still pays rendering cost later, off the hot path.

## See also

- [Logger overview](/extensions/helpers/logger/) - the standard scoped logger (start here)
- [Full reference](/extensions/helpers/logger/reference) - `HfLogger`/`HfLogFlusher` API tables and the ring-buffer entry format
- [Performance best practices](/best-practices/performance-optimization) - when high-frequency logging is and is not the answer

**Files:**

- [`packages/helpers/src/modules/logger/hf/logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/hf/logger.ts) - `HfLogger`
- [`packages/helpers/src/modules/logger/hf/flusher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/hf/flusher.ts) - `HfLogFlusher`
