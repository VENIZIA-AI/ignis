# Helper Documentation Template

Guide for writing consistent, professional helper reference docs for Ignis.

## Principles

- **Usage-first** — Show working code early, not abstract API tables
- **Integrate examples** — Don't split "API Reference" and "Usage Examples" into separate sections
- **Collapse verbose content** — Full interfaces, advanced methods, and internals go in `::: details` blocks
- **Scannable top-level** — Tables, short code blocks, and callouts; details below
- **Earn your section** — Remove any section that doesn't apply

## Section Order

| # | Section | Required | Purpose |
|---|---------|----------|---------|
| 1 | [Quick Reference](./quick-reference) | Yes | At-a-glance: classes, operations, specs |
| 2 | [Creating an Instance](./creating-instance) | Yes | Constructor with minimal example |
| 3 | [Usage Patterns](./usage-patterns) | Yes | Core body: feature areas with code |
| 4 | [API Summary](./api-summary) | No | Consolidated method table (large helpers only) |
| 5 | [Troubleshooting](./troubleshooting) | Yes | 2-5 common errors with fixes |
| 6 | [See Also](./see-also) | Yes | Categorized links |

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
- Constructor options interface (when more than 5 options)
- Full type definitions
- Advanced/rarely-used methods
- Internal implementation details
- API summary table

**Always visible**:
- Quick Reference tables
- Constructor code example
- Primary usage examples per feature area
- Troubleshooting entries
