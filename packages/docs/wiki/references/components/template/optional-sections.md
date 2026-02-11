# Optional Sections

These sections are included only when they apply to the component. Remove entirely if not needed.

## Architecture Overview

**Use for:** Complex components with multiple moving parts (Socket.IO, WebSocket, Mail).

**Skip for:** Simple components (Health Check, Request Tracker).

```markdown
## Architecture Overview

` ``
  ┌─────────────────┐
  │   Application    │
  └────────┬────────┘
           │ registers
           ▼
  ┌─────────────────┐     ┌──────────────┐
  │   Component      │────▶│    Helper     │
  └─────────────────┘     └──────────────┘
` ``
```

### Rules

- Use ASCII art or Mermaid diagrams
- Focus on data flow and component relationships
- Keep it to one diagram — if you need two, the component internals section is better

## API Endpoints

**Use for:** Components that expose REST routes (Health Check, Swagger, Static Asset).

**Skip for:** Components with no HTTP endpoints.

```markdown
## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns health status |

::: details API Specifications
**GET /health**

Response `200`:
` ``json
{
  "status": "ok"
}
` ``
:::
```

### Rules

- Summary table always visible
- Full request/response schemas in `::: details`
- Include all status codes the endpoint can return

## Component Internals

**Use for:** Complex components where understanding the lifecycle helps debugging.

**Skip for:** Simple components.

```markdown
::: details Component Internals
Detailed explanation of:
- Lifecycle hooks (binding, post-start)
- How bindings are resolved
- Internal helper initialization
- Shutdown behavior
:::
```

### Rules

- Always collapsible — this is reference material, not essential reading
- Cover the component lifecycle: `binding()` → `resolveBindings()` → post-start hook
- Mention any runtime-specific behavior (Bun vs Node.js)
