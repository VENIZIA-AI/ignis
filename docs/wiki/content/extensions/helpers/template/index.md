# Helper Documentation Template

Guide for writing consistent, professional helper reference docs for IGNIS.

## Tiers

| Tier | Structure | When to Use |
|------|-----------|-------------|
| **Tier 1 -- Single Page** | One `index.md` in a directory | Most helpers. Simple to medium complexity, single concern |
| **Tier 2 -- Two Pages** | `index.md` (setup + usage) + `api.md` (API reference) | Helpers with multiple sub-helpers, complex internals, or 800+ lines of source-verified content |

### Tier Assignment

| Helper | Tier | Rationale |
|--------|------|-----------|
| Cron, Env, Error, UID, Types | 1 | Simple wrappers or single-concern utilities |
| Crypto, Redis, Inversion, Logger | 1 | Medium complexity but single concern |
| Testing, Worker-Thread, Queue | 1 | Manageable scope, small variants |
| Network | 2 | 4 protocol families (HTTP, TCP, TLS, UDP) |
| Storage | 2 | 3 backends + base abstraction |
| Socket.IO | 2 | Server + Client helpers, Redis integration |
| WebSocket | 2 | Largest helper, Server + Emitter, complex internals |

> [!NOTE]
> Kafka uses an extended multi-page structure (`index.md` + `producer.md`, `consumer.md`, `admin.md`, `schema-registry.md`, `examples.md`) that goes beyond the Tier 2 two-page pattern.

## Principles

- **Usage-first** -- Show working code early, not abstract API tables
- **No `::: details` containers** -- Use `####` sub-headings for collapsed-style content
- **Scannable** -- Tables, short code blocks, and callouts at top level
- **Source-verified** -- All content sourced from actual source code, no inventing
- **Earn your section** -- Remove any section that does not apply
- **No emojis** -- Plain text only

## Callout Standard

Use **GitHub-style only**:

```markdown
> [!NOTE]
> Informational -- behavior clarification

> [!TIP]
> Suggestion or best practice

> [!WARNING]
> Gotcha, deprecation, or security concern

> [!IMPORTANT]
> Critical functionality impact
```

## Templates

| Template | Purpose |
|----------|---------|
| [Single Page](./single-page) | Tier 1 template -- one file per helper |

Tier 2 helpers use two pages (`index.md` + `api.md`) -- see the existing Tier 2 helper docs (Network, Storage, Socket.IO, WebSocket) for the pattern. Note this differs from [Component Tier 2](../../components/template/), which is a four-page set.

## Source Paths

| Package | Path |
|---------|------|
| Helpers | `packages/helpers/src/modules/{name}/` |
| Inversion | `packages/inversion/src/` |
| Common types | `packages/helpers/src/common/types/` |
| Utilities | `packages/helpers/src/utilities/` |
