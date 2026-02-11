# Creating an Instance

Shows how to construct the helper with a realistic, minimal example.

## Structure

```markdown
## Creating an Instance

HelperClass extends `BaseHelper`, providing scoped logging.

` ``typescript
import { HelperClass } from '@venizia/ignis-helpers';

const helper = new HelperClass({
  // Only required + most common options
  name: 'my-helper',
  host: 'localhost',
  port: 6379,
});
` ``

::: details IHelperOptions
` ``typescript
interface IHelperOptions {
  name: string;
  host: string;
  port: number;
  // ... all fields
}
` ``

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | -- | Unique identifier |
| `host` | `string` | -- | Server hostname |
| `port` | `number` | -- | Server port |
| `autoConnect` | `boolean` | `true` | Connect on creation |
:::
```

## Rules

- **Constructor example** shows only required and most common options — keep it to 3-5 lines
- **`::: details` block** contains the full interface and complete options table
- Skip the details block if the helper has 3 or fewer options
- Always mention `BaseHelper` inheritance if the helper extends it (most do)
- If the helper has a `static newInstance()` factory, document both approaches

## Where to Find Options

```
packages/helpers/src/helpers/{name}/types.ts     — interfaces
packages/helpers/src/helpers/{name}/helper.ts    — constructor defaults
```

## Example

From UID helper (simple — no details block needed):

```markdown
` ``typescript
const generator = new SnowflakeUidHelper({
  workerId: 123,
  epoch: BigInt(1735689600000),
});
` ``

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workerId` | `number` | `199` | Worker ID (0-1023) |
| `epoch` | `bigint` | `SnowflakeConfig.DEFAULT_EPOCH` | Custom epoch in ms |
```
