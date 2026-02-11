# Component Documentation Template

Guide for writing consistent, professional component reference docs for Ignis.

## Principles

- **Setup-first** — Get the reader to a working component as fast as possible
- **Collapse verbose content** — Full interfaces, API specs, and internals go in `::: details` blocks
- **Scannable top-level** — Tables, short code blocks, and callouts at the top; details below
- **Earn your section** — Remove any section that doesn't apply to the component

## Section Order

| # | Section | Required | Purpose |
|---|---------|----------|---------|
| 1 | [Quick Reference](./quick-reference) | Yes | At-a-glance: package, class, helper, runtime |
| 2 | [Binding Keys](./binding-keys) | Yes | Every DI key from `keys.ts` |
| 3 | [Setup Guide](./setup-guide) | Yes | 3-step: Bind, Register, Use |
| 4 | [Configuration](./configuration) | Yes | Options with defaults; full ref collapsed |
| 5 | [Optional Sections](./optional-sections) | No | Architecture, API Endpoints, Internals |
| 6 | [Troubleshooting](./troubleshooting) | Yes | 2-5 common errors with fixes |
| 7 | [See Also](./see-also) | Yes | Categorized links |

## Callout Standard

Use **GitHub-style only** — never mix with `::: tip` or `::: warning`:

```markdown
> [!NOTE]
> Informational — behavior clarification

> [!TIP]
> Suggestion or best practice

> [!WARNING]
> Gotcha, deprecation, or security concern

> [!IMPORTANT]
> Critical functionality impact
```

## Collapsible Strategy

**Always collapse** (`::: details`):
- Import Paths
- Full Options Reference (when more than 5 options)
- Type definitions
- API request/response schemas
- Component internals

**Always visible**:
- Quick Reference table
- Binding Keys table
- Setup Guide steps
- Default configuration summary
- Troubleshooting entries
