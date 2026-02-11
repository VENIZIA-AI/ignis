# Usage Patterns

The core body of the document. Organize by **feature area**, not by method name.

## Structure

```markdown
## Feature Area Name

Brief explanation of what this group of operations does.

` ``typescript
// Realistic code example showing the most common usage
await helper.set({ key: 'user:1', value: { name: 'Alice' } });
const user = await helper.getObject({ key: 'user:1' });
` ``

> [!TIP]
> Best practice or helpful hint relevant to this feature area.

## Next Feature Area

` ``typescript
// Another group of related operations
` ``

::: details Advanced: Rarely Used Operations
` ``typescript
// Methods that exist but most users won't need
` ``
:::
```

## How to Choose Feature Areas

Group by **what the user is trying to do**, not by class/method structure:

| Helper | Feature Areas |
|--------|--------------|
| **Redis** | Key-Value, Multi-Key, Hashes, Key Scanning, RedisJSON, Pub/Sub, Raw Execution |
| **Crypto** | AES Encryption, RSA Encryption, ECDH Key Exchange, Hashing |
| **Network** | TCP Client, TCP Server, TLS, HTTP Request, UDP Client |
| **Queue** | BullMQ, MQTT, In-Memory Queue |
| **Storage** | MinIO, Disk, Memory, File Validation |

## Rules

- Each feature area: **brief explanation** then **code example** then optional **table/callout**
- Show realistic parameters — not `'foo'` and `'bar'`, but `'user:1'` and `{ name: 'Alice' }`
- Use callouts sparingly — max 2-3 per feature area
- Collapse advanced/rarely-used methods in `::: details` blocks
- If a method has complex parameters, add a parameter table after the code example

## Callout Usage

| Callout | When |
|---------|------|
| `> [!NOTE]` | Behavior that might surprise (e.g., "no-op if already connected") |
| `> [!TIP]` | Best practice or alternative approach |
| `> [!WARNING]` | Performance concern, security issue, or common mistake |
| `> [!IMPORTANT]` | Critical: will break if ignored |

## Collapsible Blocks

Use `::: details` for:
- **Advanced methods** most users won't need
- **Full type definitions** for method parameters/returns
- **Internal behavior** explanations
- **Alternative approaches** (e.g., Axios vs Node fetch)

```markdown
::: details Advanced: Batch Operations
` ``typescript
// Less commonly needed operations
` ``
:::
```
