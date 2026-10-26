---
title: UID
description: Three ID generators - UUIDs behind one helper, time-sortable Snowflake IDs, and short random IDs a human can read back
difficulty: beginner
---

# UID

Three generators, and they answer different questions.

| Helper | Reads back as | Pick it when |
|---|---|---|
| `UuidHelper` | The version, and for a v7 the creation time | You want a UUID - a database key, an idempotency key, or a public token |
| `SnowflakeUidHelper` | Timestamp, worker ID, sequence | The ID is a primary key and you want insert order for free |
| `OpaqueUidHelper` | Nothing | The ID leaves your system - a human reads it, or a stranger sees it |

A Snowflake ID is transparent by design. `parseId()` gives back the exact millisecond it was minted and the worker that minted it. That is what you want in a log, and what you do not want printed on an invoice a customer keeps.

An opaque ID gives nothing back. You trade the ordering for that, and for a short ID a human can read out loud.

A UUID is what the rest of the world expects in a column, and `UuidHelper` is the only place IGNIS mints one.

## UuidHelper

One helper, three versions, chosen by what the ID is for.

```typescript
import { UuidHelper, UuidNamespaces } from '@venizia/ignis-helpers/core';

const uuid = UuidHelper.getInstance();

uuid.v7(); // '01a0b2ab-26d1-750c-98fb-10b72633ac2c' - database primary key
uuid.v4(); // 'e6911088-8524-4b57-9fe6-2acaec5e0be4' - public identifier, token
uuid.v5({ namespace: UuidNamespaces.URL, name: 'orders/4711/refund' }); // always the same ID
```

| Use | Version | Why |
|---|---|---|
| Database primary key | `v7()` | Time-ordered, so a B-tree appends instead of splitting pages. This is what `generateIdColumnDefs({ id: { dataType: 'string' } })` fills a string ID with |
| Idempotency key, deterministic ID | `v5({ namespace, name })` | The same inputs answer the same ID on every host, forever - there is no state to store |
| Public identifier, random token | `v4()` | No clock, nothing to correlate a caller by, 122 random bits |

`getInstance()` answers one instance per copy of the module. The instance holds no state of its own: every caller draws v7 IDs from one sequence shared by the whole realm, so the CommonJS and the ESM copy of this package still climb together.

### Pass a generator point-free

Every generator ignores the arguments it is called with, so you can hand one straight to a function that passes some:

```typescript
import { uuidV4, uuidV7 } from '@venizia/ignis-helpers/uuid';

const orderIds = Array.from({ length: 3 }, uuidV7); // Array.from passes (undefined, index)
const tokens = ['alice', 'bob'].map(uuidV4); // map passes (value, index, array)
```

The same holds for `createUuidV4()`, `createUuidV7()` and `UuidHelper.getInstance().v4` / `.v7`, and for Hono's `requestId({ generator: uuidV7 })`, which passes the request context.

### In a browser bundle, import the version you need

`UuidHelper` is a thin facade over three functions, and every version is exported on its own from the `./uuid` subpath. A bundle that needs one random ID should import that one function - the facade references all three, and a bundler cannot drop what a class references, so importing it also carries v5's SHA-1 digest, a status-code table and the error surface its namespace guard needs.

`uuidV4`, `uuidV5` and `uuidV7` each come from a factory - `createUuidV4()`, `createUuidV5()`, `createUuidV7()` - and the exported constant is the shared one every caller should use. Build your own only when a private sequence is the point, which in practice means a test: `createUuidV7()` gives a generator with its own clock state and counter, so a test can drive it without disturbing the shared sequence.

```typescript
// A browser framework that needs one tracing ID - 409 B gzipped
import { uuidV4 } from '@venizia/ignis-helpers/uuid';

const requestId = uuidV4();
```

Measured with `bun build --target=browser --minify`, gzipped, against the published `dist`:

| Import | gzip |
|---|---|
| `uuidV4` from `./uuid` | **409 B** |
| `uuidV7` from `./uuid` | **572 B** |
| `uuidV5` from `./uuid` | 8.7 KB |
| `UuidHelper` from `./uuid` or `./core` | 9.9 KB |

The two small numbers are asserted by a test, not just measured once: `uuid-bundle-budget.test.ts` bundles each entry and fails if `uuidV4` passes 600 B or `uuidV7` passes 800 B. Re-exporting either through anything that reaches `getError` puts it back over budget, and that test is what catches it. v5 is allowed to be large - it needs the digest and a framework error for a bad namespace - and the budgets prove importing v4 does not drag it in.

On a server, keep importing `UuidHelper` from `./core`. The subpath exists for the case where nine kilobytes is the whole budget.

### v5 is reproducible, which is the point and the limit

A version 5 ID is `SHA-1(namespace + name)` rendered as a UUID. Derive it from the business data and you never store a lookup table:

```typescript
const idempotencyKey = uuid.v5({
  namespace: UuidNamespaces.URL,
  name: `refund:${orderId}:${chargeId}`,
});
```

Two things to hold onto:

- **It is not a secret.** Anyone with the namespace and the name computes the same ID. Never use one as a share link, a reset token or an API key - that is what `v4()` is for.
- **It gives a stable key, not exclusivity.** What enforces idempotency is the unique index on the column plus handling the conflict on insert. The ID only makes the second attempt recognisable.

The namespace is read case-insensitively, and the nil UUID is accepted as one. A name holding a lone surrogate (malformed UTF-16) is refused with a 400: encoding would turn it into U+FFFD, and two different names would share an ID.

The four namespaces RFC 9562 defines ship as `UuidNamespaces.DNS`, `.URL`, `.OID` and `.X500`. A namespace partitions the space, so the same name under two namespaces answers two IDs. If none of them fit, mint one with `v4()` **once** and pin it as a constant:

```typescript
const TENANT_NAMESPACE = '6f5a6a4e-70dd-4a4f-8e4e-2b2f2b2f2b2f'; // minted once, never generated

uuid.v5({ namespace: TENANT_NAMESPACE, name: tenantSlug });
```

### Reading an ID back

```typescript
UuidHelper.isValid('2ed6657d-e927-568b-95e1-2665a8aea6a2'); // true - lowercase, version 1-8, RFC variant
UuidHelper.isValid('00000000-0000-0000-0000-000000000000'); // false - the nil ID is a placeholder

uuid.inspect({ value: uuid.v7() }); // { version: 7, createdAt: Date }
uuid.inspect({ value: uuid.v4() }); // { version: 4 } - nothing to read out of random bits
uuid.inspect({ value: 'not-a-uuid' }); // undefined
```

A v7 timestamp can sit a few milliseconds **ahead** of the clock. At least 2048 IDs fit in one millisecond (the counter starts at a random value below 2048 and climbs to 4095). Past that the generator borrows the next millisecond to keep the sequence climbing, so a `createdAt` read during a burst leads the wall clock by roughly one millisecond per 2048 to 4096 IDs.

### Why IGNIS mints these itself

Every version here runs on a plain-http origin and inside a browser Worker, which is the constraint that rules out the obvious implementations: `crypto.randomUUID` is secure-context-only (on `http://<lan-ip>` it is `undefined` and the first call throws), `crypto.subtle.digest` is gated the same way and is asynchronous on top of it, and `node:crypto` is a Node builtin the browser-purity gate refuses. `v4()` calls `crypto.randomUUID` with no argument where the realm allows it, and falls back to `crypto.getRandomValues` with an identical shape where it does not. `v5()` carries its SHA-1 inline, so it stays synchronous like the other two.

`v7()` never uses `Bun.randomUUIDv7`, on any runtime. Its own `getRandomValues` generator measured 43 ns against 58 ns for the native one, and the native one reads its arguments as an encoding and a timestamp. `Array.from({ length: 3 }, Bun.randomUUIDv7)` mints IDs stamped at the 1970 epoch.

Measured against `uuid@14` on Bun 1.4.2, median. v4 runs at parity, because both call `crypto.randomUUID`. The other two do not:

| Version | IGNIS | `uuid@14` |
|---|---|---|
| v5 | 395 ns | 1163 ns |
| v7 | 43 ns | about 210 ns |

The v5 output is verified identical to that package's, to the published RFC test vector, and to the platform SHA-1 across padding boundaries.

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
import { OpaqueUidHelper, RetryHelper } from '@venizia/ignis-helpers';

const generator = new OpaqueUidHelper({
  prefix: { enable: true, value: 'INV' },
  delimiter: { enable: true, value: '-' },
});

const invoice = await RetryHelper.executeWithRetry({
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
- [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html) - the UUID specification, versions 1 through 8
- [Snowflake ID](https://en.wikipedia.org/wiki/Snowflake_ID) - the algorithm this helper implements

**Files:**

- [`packages/helpers/src/modules/uid/uuid/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/uuid/helper.ts) - `UuidHelper`
- [`packages/helpers/src/modules/uid/uuid/v4.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/uuid/v4.ts) - `uuidV4`, `createUuidV4` - the 398 B path
- [`packages/helpers/src/modules/uid/uuid/v5.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/uuid/v5.ts) - `uuidV5`, `createUuidV5`
- [`packages/helpers/src/uuid.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/uuid.ts) - the `./uuid` subpath entry
- [`packages/helpers/src/modules/uid/uuid/v7.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/uuid/v7.ts) - `uuidV7`, `createUuidV7`
- [`packages/helpers/src/modules/uid/uuid/sha1.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/uuid/sha1.ts) - the inline SHA-1 behind v5
- [`packages/helpers/src/modules/uid/uuid/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/uuid/common/constants.ts) - `UuidNamespaces`
- [`packages/helpers/src/modules/uid/request-id.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/request-id.ts) - `RequestIdGenerator`, a delegate over `v4()`
- [`packages/helpers/src/modules/uid/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/helper.ts) - `SnowflakeUidHelper`, `SnowflakeConfig`
- [`packages/helpers/src/modules/uid/opaque.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/opaque.ts) - `OpaqueUidHelper`
- [`packages/helpers/src/modules/uid/common/constants.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/common/constants.ts) - `UidAlphabets`, `UidCaseForms`
- [`packages/helpers/src/modules/uid/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/uid/index.ts) - module barrel
