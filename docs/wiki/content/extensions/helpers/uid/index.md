---
title: UID
description: Two ID generators - time-sortable Snowflake IDs, and short random IDs a human can read back
difficulty: beginner
---

# UID

Two generators, and they answer different questions.

| Helper | Reads back as | Pick it when |
|---|---|---|
| `SnowflakeUidHelper` | Timestamp, worker ID, sequence | The ID is a primary key and you want insert order for free |
| `OpaqueUidHelper` | Nothing | The ID leaves your system - a human reads it, or a stranger sees it |

A Snowflake ID is transparent by design. `parseId()` gives back the exact millisecond it was minted and the worker that minted it. That is what you want in a log, and what you do not want printed on an invoice a customer keeps.

An opaque ID gives nothing back. You trade the ordering for that, and for a short ID a human can read out loud.

## In one example

```typescript
import { SnowflakeUidHelper } from '@venizia/ignis-helpers';

const generator = new SnowflakeUidHelper(); // workerId: 199, epoch: 2025-01-01 UTC
const id = generator.nextId();
// => e.g. "9du1sJXO88"
```

Use one `SnowflakeUidHelper` instance per worker process. `nextId()` returns a URL-safe Base62 string, and it sorts in the same order the IDs were generated.

## How it works

- **The ID packs three fields into 70 bits.** `nextSnowflake()` shifts and OR's together a timestamp, a worker ID, and a sequence - see the bit layout below.
- **Sorting the ID sorts by generation time.** This holds for the raw `bigint`, and for the Base62 string.
- **The sequence resets every millisecond, per worker.** It increments within the millisecond and wraps at 4096.
- **A wrap forces a busy-wait for the next millisecond.** That caps throughput at 4,096,000 IDs per second per worker.
- **A small backward clock drift busy-waits.** Up to 100ms (`MAX_CLOCK_BACKWARD_MS`), the generator waits for the clock to catch up, and logs a warning.
- **A larger drift throws instead.** IGNIS refuses to risk generating a duplicate ID.
- **`encodeBase62` / `decodeBase62` are a bigint <-> string codec.** They don't know about the Snowflake layout.
- **`parseId()` layers on top of the codec.** It calls `decodeBase62()`, then the three `extract*` calls, using the same instance's `epoch` and bit-shift constants.
- **An expiry warning logs once the epoch nears its 48-bit limit.** The timestamp field overflows about 8,919 years after the configured epoch. A warning starts logging 10 years before that.

**Snowflake layout (70 bits)**

| Component | Bits | Range | Purpose |
|-----------|------|-------|---------|
| Timestamp | 48 | ~8,919 years | Milliseconds since `epoch` |
| Worker ID | 10 | 0-1023 | Set per instance, must be unique across a deployment |
| Sequence | 12 | 0-4095 | IDs generated within the same millisecond |

**`IIdGeneratorOptions`**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerId` | `number` | `199` | Integer, `0`-`1023` |
| `epoch` | `bigint` | `BigInt(1735689600000)` (2025-01-01 00:00:00 UTC) | Positive, must be in the past |

## Common tasks

### Generate an ID

`nextId()` is the common case - a Base62 string, 10-12 characters. `nextSnowflake()` returns the raw `bigint`, for arithmetic or bit-level access.

```typescript
const id = generator.nextId();               // "9du1sJXO88"
const raw = generator.nextSnowflake();        // 130546360012247045n
```

### Parse an ID back into its components

```typescript
const parsed = generator.parseId('9du1sJXO88');
// => { raw: 130546360012247045n, timestamp: Date, workerId: 199, sequence: 0 }
```

### Extract a single component from a raw ID

```typescript
const timestamp = generator.extractTimestamp(raw);
const workerId = generator.extractWorkerId(raw);
const sequence = generator.extractSequence(raw);
```

### Run one generator per worker in a distributed deployment

Give each process a unique `workerId`. Keep `epoch` identical across every process, so ID ordering stays meaningful.

```typescript
const generator = new SnowflakeUidHelper({ workerId: Number(process.env.WORKER_ID) });
```

### Decode Base62 defensively

`decodeBase62()` throws on any character outside `0-9A-Za-z` - including a leading space or a URL-decoded `+`.

```typescript
try {
  const raw = generator.decodeBase62(userSuppliedId);
} catch (error) {
  // not a valid Base62 ID
}
```

## OpaqueUidHelper

```typescript
import { OpaqueUidHelper } from '@venizia/ignis-helpers';

const generator = new OpaqueUidHelper({
  prefix: { enable: true, value: 'INV' },
  delimiter: { enable: true, value: '-' },
  length: 6,
});

generator.nextId();
// => e.g. "INV-7K2MQ9"
```

`length` counts the body only. The prefix and the delimiter sit in front of it, so that ID is 10 characters.

### Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `prefix` | `{ enable, value? }` | disabled | Leads the ID. `value` survives being disabled, so you can toggle it back on |
| `delimiter` | `{ enable, value? }` | disabled, `_` | Separates prefix from body. Requires a prefix |
| `length` | `number` | `6` | Characters in the body |
| `caseForm` | `'upper' \| 'lower' \| 'mixed'` | `'upper'` | Folds the alphabet before sampling |
| `alphabet` | `string` | `UidAlphabets.CROCKFORD` | The characters to draw from |
| `exclude` | `string` | `''` | Removed from `alphabet` |

Four alphabets ship with it:

| Alphabet | Size | Drops | Use for |
|---|---|---|---|
| `CROCKFORD` | 32 | Lowercase, `I` `L` `O` `U` | IDs a human reads, types, or says aloud |
| `BASE58` | 58 | `0` `O` `I` `l` | IDs in a URL or a log |
| `NO_VOWEL` | 50 | `BASE58` plus every vowel | Customer-facing IDs - no word can form |
| `BASE62` | 62 | Nothing | Machines only |

`getAlphabet()` returns the set actually in use, after the case fold and every exclusion. That is what `length` is measured against, so read it before calculating how many IDs a length affords you.

### Six characters needs a unique index

Six Crockford characters is 2^30 combinations, the size of an airline record locator. That works for airlines because of three things, not because 2^30 is large:

1. **Scoped.** A record locator is unique per carrier, not worldwide.
2. **Recycled.** The airline reuses it once the trip is over.
3. **Retried.** The reservation system regenerates on conflict.

> [!WARNING]
> At the default length, a 1% chance of at least one collision arrives at roughly 4,600 IDs in one space, and 50% at roughly 38,000.

A `prefix` PARTITIONS the space. `INV-7K2MQ9` can never collide with `CUS-7K2MQ9`, so ten entity types get ten separate spaces instead of sharing one. It does not make an ID unique inside its own space - within `INV`, the numbers above still hold.

So do both. Give each entity type its own `prefix`, and put the column behind a unique index.

### Reject an ID you already hold

`nextId()` takes a callback. Return `true` to accept the ID, `false` to draw another.

```typescript
const issued = new Set<string>();
const generator = new OpaqueUidHelper({ length: 8 });

const id = generator.nextId({
  isAvailable: candidate => !issued.has(candidate),
});
issued.add(id);
```

Every argument is optional, including the options object itself - `nextId()` alone is the common case.

**`nextId()` options**

| Option | Type | Default | Meaning |
|---|---|---|---|
| `prefix` | `string` | The configured prefix | Replaces it for this call |
| `isAvailable` | `(id: string) => ValueOrPromise<boolean>` | none | `true` accepts, `false` draws again |
| `maxAttempts` | `number` | `10` | Draws before it throws. Requires `isAvailable` |

The callback sees the finished ID, prefix and delimiter included - the string the column stores.

**The callback's return type decides `nextId`'s.** A synchronous check keeps the call synchronous, so no promise is allocated. An asynchronous one makes it a promise:

```typescript
const id = generator.nextId({ isAvailable: candidate => !issued.has(candidate) });
// string

const id = await generator.nextId({
  isAvailable: async candidate => !(await invoiceRepository.exists(candidate)),
});
// Promise<string>
```

> [!WARNING]
> An asynchronous check does not make an ID safe. Against a database it is a read and then a write with a gap between them, and another request can take the ID inside that gap. `isAvailable` lowers the collision rate; the unique index is what removes it.

`maxAttempts` bounds the redraws. Repeated rejection means the space is full, and the helper throws with the length and alphabet size rather than looping.

### Regenerate on conflict, never check first

Insert and catch the violation. Checking whether an ID exists and then inserting it leaves a window where another request takes the same ID between the two statements.

```typescript
import { executeWithRetry, OpaqueUidHelper } from '@venizia/ignis-helpers';

const generator = new OpaqueUidHelper({
  prefix: { enable: true, value: 'INV' },
  delimiter: { enable: true, value: '-' },
});

const invoice = await executeWithRetry({
  operation: 'createInvoice',
  maxAttempts: 5,
  // A fresh ID per attempt - retrying with the same one would collide forever.
  execution: () => invoiceRepository.create({ data: { id: generator.nextId(), total } }),
  shouldRetry: context => isUniqueViolation(context.error),
});
```

Five attempts is generous. At the default length a second collision on the same insert has a probability in the millionths.

Or raise `length` - every extra character multiplies the space by 32.

### What the constructor refuses

Each of these fails loudly at construction, because each one fails silently at runtime:

| Configuration | Why it is refused |
|---|---|
| `delimiter` enabled, `prefix` disabled | The delimiter would lead the ID and separate nothing |
| A delimiter character that is in the alphabet | The ID could not be split back into prefix and body |
| A `prefix` that disagrees with `caseForm` | A lowercase prefix on an uppercase ID defeats the reason for choosing one case |
| `caseForm` folding a two-case alphabet | Uppercasing `BASE58` brings `I` and `O` back - the pair it drops so `1` and `0` stay readable |
| An alphabet under 16 characters | `exclude` has eaten it |
| `maxAttempts` passed without `isAvailable` | Nothing rejects a draw, so the retry it configures cannot happen |

### Randomness

`OpaqueUidHelper` draws from `crypto.getRandomValues`, and rejects samples that fall outside the alphabet rather than wrapping them. A `byte % 58` would favour the first 24 characters by about 1.5%, forever, and no caller could see it.

Unlike `crypto.randomUUID`, `getRandomValues` works outside a secure context. The generator runs on a plain-http origin and inside a browser Worker.

## See also

- [Models](/guides/core-concepts/persistent/models) - using UIDs as primary keys
- [Services](/guides/core-concepts/services) - generating unique IDs in services
- [Helpers Overview](/extensions/helpers/) - all available helpers
- [Crypto Helper](/extensions/helpers/crypto/) - cryptographic random values
- [Snowflake ID](https://en.wikipedia.org/wiki/Snowflake_ID) - the algorithm this helper implements

**Files:**

- [`packages/helpers/src/modules/uid/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/helper.ts) - `SnowflakeUidHelper`, `SnowflakeConfig`
- [`packages/helpers/src/modules/uid/opaque.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/opaque.ts) - `OpaqueUidHelper`
- [`packages/helpers/src/modules/uid/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/common/constants.ts) - `UidAlphabets`, `UidCaseForms`
- [`packages/helpers/src/modules/uid/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/index.ts) - module barrel
