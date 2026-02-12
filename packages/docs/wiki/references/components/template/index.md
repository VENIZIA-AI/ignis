# Component Documentation Template

Guide for writing consistent, professional component reference docs for Ignis.

## Principles

- **Setup-first** -- Get the reader to a working component as fast as possible
- **Show everything** -- No collapsible sections; use `####` sub-headings for verbose content
- **Scannable top-level** -- Tables, short code blocks, and callouts for navigation
- **Earn your section** -- Remove any section that doesn't apply to the component

## Tiers

| Tier | Structure | When to Use | Examples |
|------|-----------|-------------|----------|
| **Tier 1** | [Single page](./single-page) | 5 or fewer config options, straightforward behavior | Health Check, Request Tracker, Swagger |
| **Tier 2** | 4 pages | 6+ config options, multiple strategies/providers, architectural depth | Authentication, Mail, Socket.IO, WebSocket, Static Asset |

### Tier 1 -- Single Page

One file: `{component-slug}.md` (e.g., `health-check.md`). Contains everything: Quick Reference, Setup, Configuration, Binding Keys, Troubleshooting, See Also.

See [Single-Page Template](./single-page).

### Tier 2 -- Four Pages

A directory with 4 files:

| File | Page Title | Content | Template |
|------|-----------|---------|----------|
| `index.md` | Setup & Configuration | Quick ref, imports, setup steps 1-2, config tables, binding keys | [Template](./setup-page) |
| `usage.md` | Usage & Examples | Step 3 usage, patterns, flows, API endpoints, integration examples | [Template](./usage-page) |
| `api.md` | API Reference | Architecture diagrams, method signatures, internals, types | [Template](./api-page) |
| `errors.md` | Error Reference | Error tables by source, troubleshooting entries | [Template](./errors-page) |

#### Sidebar Pattern

```typescript
{
  text: 'ComponentName',
  collapsed: true,
  items: [
    { text: 'Setup & Configuration', link: '/references/components/slug/' },
    { text: 'Usage & Examples', link: '/references/components/slug/usage' },
    { text: 'API Reference', link: '/references/components/slug/api' },
    { text: 'Error Reference', link: '/references/components/slug/errors' },
  ],
},
```

#### Cross-Links

Every page in a Tier 2 set gets a `## See Also` footer linking to its 3 sibling pages (omit the current page):

```markdown
## See Also

- [Setup & Configuration](./) -- Quick reference, setup steps, configuration options
- [Usage & Examples](./usage) -- Usage patterns, examples, API endpoints
- [API Reference](./api) -- Architecture, method signatures, internals
- [Error Reference](./errors) -- Error tables and troubleshooting
```

Add external links (guides, helpers, libraries) after the sibling links.

## Source Paths

When documenting a component, find source material here:

| What | Path |
|------|------|
| Binding keys | `packages/core/src/components/{name}/common/keys.ts` |
| Config types | `packages/core/src/components/{name}/common/types.ts` |
| Error messages | `packages/core/src/components/{name}/component.ts` -- look for `throw getError()` |
| Helper source | `packages/helpers/src/helpers/{name}/` |

## Callout Standard

Use **GitHub-style only** -- never `::: tip` or `::: warning`:

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

## Content Visibility

**All content is always visible** -- no `::: details` collapsible blocks.

Use `####` sub-headings to organize verbose content like:
- Import Paths
- Full Options Reference
- Type definitions
- API request/response schemas
- Source code examples
