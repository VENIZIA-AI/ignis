# Error Reference Page Template (Tier 2 -- errors.md)

The "fix what's broken" page. A developer reads this when they encounter an error or unexpected behavior. Contains error tables organized by source and troubleshooting entries with cause/fix pairs.

Paired with [Setup](./setup-page), [Usage](./usage-page), and [API Reference](./api-page).

## When to Use

Always created alongside the other 3 pages for Tier 2 components.

## Page Structure

```markdown
# {Component Name} -- Error Reference

> Error codes, error conditions, and troubleshooting for the [{Component Name}](./) component.

## Error Reference

### {Error Source 1} (e.g., "Component Errors", "JWTTokenService Errors")

| Error / Condition | When It Occurs |
|-------------------|----------------|
| `Error message or code` | Trigger condition |
| `Another error` | Another trigger |

### {Error Source 2}

| Error / Condition | When It Occurs |
|-------------------|----------------|
| `Error message or code` | Trigger condition |

### {Error Source 3} (repeat as needed)

| Error / Condition | When It Occurs |
|-------------------|----------------|
| `Error message or code` | Trigger condition |

## Troubleshooting

### "{Exact error message or symptom}"

**Cause:** Why this happens.

**Fix:**

` ``typescript
// Fix example
` ``

### "{Another common issue}"

**Cause:** Why this happens.

**Fix:** How to resolve it.

### "{Third issue}"

**Cause:** Why this happens.

**Fix:**

` ``typescript
// Fix example
` ``

## See Also

- [Setup & Configuration](./) -- Quick reference, setup steps, configuration options
- [Usage & Examples](./usage) -- Usage patterns, examples, API endpoints
- [API Reference](./api) -- Architecture, method signatures, internals

- **Guides:**
  - [Components](/guides/core-concepts/components) - Component system overview

- **Components:**
  - [All Components](../index) - Built-in components list
```

## Rules

- **File name:** Always `errors.md` inside the component directory
- **Focus:** What can go wrong and how to fix it
- **Error Reference section:** Organize error tables by source class/module (e.g., "Component Errors", "TokenService Errors", "Controller Errors")
- **Error table columns:** Use `Error / Condition` and `When It Occurs`. Keep descriptions concise
- **Troubleshooting section:** Minimum 2 entries, maximum 10. Order by frequency -- most common issue first
- **Troubleshooting heading** uses the exact error message in quotes, or a clear symptom description
- **Cause** is 1-2 sentences explaining why
- **Fix** includes a code example when the fix involves code changes
- **No setup steps** on this page -- those are in `index.md`
- **No usage examples** on this page -- those are in `usage.md`
- **No architecture** on this page -- those are in `api.md`
- **No collapsible sections** -- show all content directly
- Use `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!IMPORTANT]` callouts

## Where to Find Error Messages

1. Component source: `component.ts` -- look for `throw getError()` and `ApplicationError`
2. Helper source: the underlying helper's error handling
3. Common misconfiguration patterns from the binding keys and options
