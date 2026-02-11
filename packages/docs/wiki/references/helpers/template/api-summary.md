# API Summary

Optional consolidated method table. Use only for helpers with many methods.

## When to Include

- **Include:** Redis (20+ methods), Network (15+ methods), Storage (10+ methods)
- **Skip:** UID (5 methods), Cron (3 methods), Environment (4 methods)

Rule of thumb: if the helper has more than 8 public methods, include an API Summary.

## Structure

Always collapsible. Always placed **after** the usage sections, not before.

```markdown
::: details API Summary

| Method | Returns | Description |
|--------|---------|-------------|
| `set(opts)` | `Promise<void>` | Set a key-value pair |
| `get(opts)` | `Promise<string \| null>` | Get raw value by key |
| `getObject(opts)` | `Promise<T \| null>` | Get parsed JSON object |
| `del(opts)` | `Promise<void>` | Delete one or more keys |

:::
```

## Rules

- Use `::: details` — this is reference material, not essential reading
- List **all** public methods, including those documented in feature area sections
- Sort by category (matching the feature areas), not alphabetically
- Show the options parameter as `(opts)` — don't expand the full signature
- Return types should be the actual TypeScript types from source
