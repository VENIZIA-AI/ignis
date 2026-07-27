---
title: HfLogger - High-Frequency Logging Guide
description: How to use the ring-buffer HfLogger correctly - setup, the ILogger surface, hot-path cost model, flusher lifecycle, and the limitations you must design around.
difficulty: advanced
---

# HfLogger - High-Frequency Logging Guide

`HfLogger` is a fixed-layout ring-buffer logger for hot paths where even the standard `Logger` is too expensive. A log call writes a 256-byte binary entry into a lazily-allocated buffer. Nothing runs on the fast path: no string formatting, no transport I/O, no per-call allocation. A separate `HfLogFlusher` drains entries later, off the hot path.

It implements `ILogger` (`AbstractLogger`), so it's a drop-in replacement anywhere an `ILogger` is expected. Every level method works - `debug`, `info`, `warn`, `error`, `emerg`, plus `log` and `for`. But it stays entirely separate from the Winston-backed `Logger` pipeline: no formatters, no transports, no `APP_ENV_LOGGER_*` variables apply to it.

That separation buys enqueue speed - roughly 14x faster than pino on the same machine. See [Performance characteristics](#performance-characteristics) below for the measured numbers.

> [!IMPORTANT]
> Reach for `HfLogger` only when a profiler shows logging itself in your hot path - order engines, market-data ticks, per-packet paths at 100k+ events/sec. For everything else, the standard scoped `Logger` is the right tool: it formats, redacts, rotates files, and ships UDP. Most services never need this module.

## Mental model

One ring buffer per process holds 65,536 entries of 256 bytes each - 16MB total. It allocates lazily, on the first `HfLogger.get()` call, never at module import.

Writers stamp entries in. The ring never blocks and never grows.

When the ring is full, the next write overwrites the oldest entry. The buffer trades completeness for a bounded, allocation-free hot path. But every overwrite is counted and reported, never silent - see [Lap accounting](#lap-accounting) below.

**Entry layout (256 bytes):**

| Offset | Size | Field |
|--------|------|-------|
| 0-7 | 8 bytes | Timestamp (`float64` epoch milliseconds, sub-millisecond precision) |
| 8 | 1 byte | Level (`0`=debug, `1`=info, `2`=warn, `3`=error, `4`=emerg) |
| 9 | 1 byte | Scope length (0-32) |
| 10-41 | 32 bytes | Scope bytes |
| 42 | 1 byte | Message length (0-213) |
| 43-255 | 213 bytes | Message bytes |

The two length bytes are what make reads exact. The flusher decodes only the bytes a field actually holds, never the fixed-width remainder. So there's no NUL padding, no stale tail leaking from whatever a reused slot last held.

Because entries are fixed-width binary, everything you log must fit the layout above. Anything longer than the scope or message cap is truncated, not rejected.

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
// -- Or drain manually (for example, at a batch boundary or before shutdown) --
await flusher.flush();

// -- And stop the interval when the logger is no longer needed --
flusher.stop();
```

## The ILogger surface - and its cost model

`HfLogger` implements the same `ILogger` methods as the standard `Logger`, so it can be typed and passed around as `ILogger`. But each method sits on a different point of the cost curve. Picking the right one is the whole point of this module:

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

Rule of thumb:

| When | Use | Cost |
|---|---|---|
| A per-event, per-tick, per-packet path | Pre-encode, then call the bytes overload | ~59ns/op |
| A small fixed set of facts you didn't pre-encode | The no-args string call | ~66ns/op |
| Off the true hot path only | The args form (dynamic `%s` data) | Correct - nothing is ever silently dropped - but not free |

## The rules that keep it fast and correct

**1. Never encode in the hot path.** `HfLogger.encodeMessage` remembers every distinct string it sees. So does the no-args string call, since it shares the same cache. That cache is FIFO-bounded at 4096 entries.

Calling it with dynamic strings (`encodeMessage('order ' + id)`) still puts UTF-8 encoding on your hot path. Worse, it evicts the oldest cached message once you cross the cap - corrupting the fixed vocabulary you rely on elsewhere.

If a value varies per event, it doesn't belong in an `HfLogger` message. Log the static fact here, and the variable detail through the standard `Logger` at a lower frequency. Or use the args form, off the hot path.

**2. A fixed vocabulary of messages.** The bytes path targets a finite set of pre-encoded facts: "Order sent", "Tick received", "Risk check failed".

If you find yourself needing free-form text on the hot path, you're in the wrong module. Use the args form instead, off the hot path.

**3. Size the flush interval against your write rate.** The ring holds 65,536 entries. Write more than that between two flushes, and the oldest unflushed entries get overwritten. The flusher reports exactly how many via `dropped` on the sink batch - never silently (see below).

Pick the interval so `writeRate x interval < 65,536`, with comfortable margin. At 100k logs/sec, a 100ms interval accumulates ~10k entries per drain - safe. At 1M logs/sec, you need ~30ms or faster.

**4. One process, one thread.** `HfLogger` is safe only on a single thread within a single process. The write index is a plain counter - not shared, not atomic.

Don't log to it from worker threads. Each worker that imports the module gets its own independent ring, and nothing coordinates them. This is a documented design point, not an accident.

**5. Flush before shutdown.** Entries live only in memory. An exiting process loses everything not yet flushed. Call `await flusher.flush()` in your shutdown path, and `flusher.stop()` to clear the interval.

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
await flusher.flush(); // one-shot drain, for example before shutdown
flusher.stop(); // clears the interval; start() again to resume
```

A rendered line looks like this:

```
2026-07-18T09:41:03.128Z [info] OrderEngine Order sent
```

`<ISO timestamp> [<level name>] <scope> <message>` - readable, parseable, and free of NULs or stale bytes.

### Lap accounting

Every batch the flusher hands to its sink carries `dropped: number`. That's the count of entries the ring overwrote before the flusher could read them, since the previous batch. The default sink emits a `warn` marker line ahead of the batch when `dropped > 0`:

```
2026-07-18T09:41:03.200Z [warn] HfLogFlusher ring lapped - 342 entries overwritten before they could be read
```

A custom `sink` gets the same `dropped` count on `batch.dropped` and decides how to surface it. This replaces the old silent behavior, where a lapped ring emitted whatever currently sat in each slot with no warning.

## Current limitations

These are real behaviors of the current implementation - design around them:

- **Single-thread only.** The write index is not shared or atomic across threads. Each worker thread that imports the module gets an independent ring. Don't log to `HfLogger` from worker threads expecting a shared buffer.
- **The ring overwrites the oldest entry when lapped.** If the producer writes faster than the flusher drains (see rule 3 above), unflushed entries get silently overwritten in memory.
- **The loss is visible, not invisible.** The flusher counts and reports every overwritten entry via `dropped`.
- **213-byte message cap, 32-byte scope cap.** Both are truncation-only - a longer value is cut, not rejected.
- **Truncation happens at a byte boundary, not a character boundary.** It can split a multibyte UTF-8 character - the truncated tail then renders as the U+FFFD replacement character.
- **Run one flusher per process.** Each `HfLogFlusher` tracks its own read position from the start of the ring - not a shared cursor. A second flusher re-emits entries the first one already drained.
- **A fixed, pre-encoded vocabulary is still the right pattern for the bytes path.** `HfLogger.encodeMessage` and the no-args string call exist to make the ENCODE cost a one-time expense.
- **The args form is correct, but it's the slow path by design.** Reserve it for control-flow events, off the hot path.
- **The encode cache is FIFO-bounded at 4096 entries.** That's well within a real fixed vocabulary. But a hot path that generates many distinct dynamic strings, through the no-args string call, will start evicting and re-encoding.

## Performance characteristics

Measured on Bun 1.3.14, 1M-iteration median:

| Path | Cost | Notes |
|------|------|-------|
| Bytes (`log(level, preEncodedBytes)`) | 59.4ns/op | The true hot path - no formatting, no allocation |
| String, no args (`info('Order sent')`) | 66.0ns/op | Cache-hit encode lookup + bytes-path write |
| pino, sync, `/dev/null` | 831ns/op | ~14x slower than the `HfLogger` bytes path on the same machine |

Heap growth measured at 0.0MB over 1M bytes-path logs - the hot path does not allocate. That buys an ENQUEUE, not a durable log line. The flusher still pays rendering cost later, off the hot path.

## See also

- [Logger overview](/extensions/helpers/logger/) - the standard scoped logger (start here)
- [Full reference](/extensions/helpers/logger/reference) - `HfLogger`/`HfLogFlusher` API tables and the ring-buffer entry format
- [Performance best practices](/best-practices/performance-optimization) - when high-frequency logging is and is not the answer

**Files:**

- [`packages/helpers/src/modules/logger/hf/logger.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/hf/logger.ts) - `HfLogger`
- [`packages/helpers/src/modules/logger/hf/flusher.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/logger/hf/flusher.ts) - `HfLogFlusher`
