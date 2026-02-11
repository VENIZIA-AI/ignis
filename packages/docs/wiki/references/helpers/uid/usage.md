# Usage

## Generating IDs

Generate unique Snowflake IDs as either compact Base62 strings or raw bigints.

```typescript
// Generate Base62 encoded ID (recommended for most use cases)
const id = generator.nextId();
// => e.g., "9du1sJXO88"

// Generate raw Snowflake ID as bigint
const snowflakeId = generator.nextSnowflake();
// => e.g., 130546360012247045n
```

> [!TIP]
> Use `nextId()` for most cases -- it returns a compact Base62 string (10-12 chars) that works well as database primary keys and URL-safe identifiers. Use `nextSnowflake()` only when you need the raw bigint for arithmetic or bit-level operations.

## ID Formats

### Base62 Encoding

Encode any bigint to a compact, URL-safe Base62 string using the alphabet `0-9A-Za-z`.

```typescript
const encoded = generator.encodeBase62(130546360012247045n);
// => "9du1sJXO88"
```

### Base62 Decoding

Decode a Base62 string back to its original bigint value.

```typescript
const decoded = generator.decodeBase62("9du1sJXO88");
// => 130546360012247045n
```

> [!WARNING]
> `decodeBase62()` throws if the input contains characters outside the Base62 alphabet (`0-9`, `A-Z`, `a-z`). Watch for URL-encoded strings or accidental whitespace.

## Parsing IDs

Extract the embedded timestamp, worker ID, and sequence from a generated ID.

### Parse a Base62 ID

```typescript
const parsed = generator.parseId("9du1sJXO88");
// => {
//   raw: 130546360012247045n,
//   timestamp: Date,
//   workerId: 199,
//   sequence: 0
// }
```

::: details ISnowflakeParsedId
```typescript
interface ISnowflakeParsedId {
  raw: bigint;
  timestamp: Date;
  workerId: number;
  sequence: number;
}
```
:::

### Extract Individual Components

```typescript
const snowflakeId = generator.nextSnowflake();

// Extract timestamp
const timestamp = generator.extractTimestamp(snowflakeId);
// => Date object

// Extract worker ID
const workerId = generator.extractWorkerId(snowflakeId);
// => 199

// Extract sequence
const sequence = generator.extractSequence(snowflakeId);
// => 0-4095

// Get current instance's worker ID
const currentWorkerId = generator.getWorkerId();
// => 199
```
