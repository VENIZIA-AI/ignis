# Quick Reference

First section after the title. Gives the reader everything they need at a glance.

## Structure

```markdown
## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `ComponentClass` |
| **Helper** | [`HelperClass`](/references/helpers/slug) |
| **Runtimes** | Both / Bun only |

::: details Import Paths
` ``typescript
import { ComponentClass, BindingKeys } from '@venizia/ignis';
import type { IConfigOptions } from '@venizia/ignis';
` ``
:::
```

## Rules

- **Package** is always `@venizia/ignis` for components
- **Helper** links to the corresponding helper reference doc
- **Runtimes** — "Both" for most; "Bun only" for WebSocket
- **Import Paths** always in a `::: details` collapsible block
- Include both class imports and type imports

## Optional: Critical Callout

Add an `> [!IMPORTANT]` callout **only** when there's a runtime, dependency, or behavioral note the reader must know before using the component. Remove entirely if not needed.

```markdown
> [!IMPORTANT]
> This component requires Bun runtime. Node.js is not supported.
```

## Examples

**Simple** (Request Tracker):
| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `RequestTrackerComponent` |
| **Runtimes** | Both |

**With Helper** (WebSocket):
| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `WebSocketComponent` |
| **Helper** | [`WebSocketServerHelper`](/references/helpers/websocket) |
| **Runtimes** | Bun only |
