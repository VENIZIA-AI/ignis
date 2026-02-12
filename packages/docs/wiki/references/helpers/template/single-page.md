# Single-Page Helper Template (Tier 1)

Use this template for Tier 1 helpers -- one `index.md` file per helper directory.

---

## Template

````markdown
# {Helper Name}

One-line description sourced from the class JSDoc or module purpose.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Class** | `HelperClass` |
| **Extends** | `BaseHelper` |
| **Runtimes** | Both / Bun only |

For multi-class helpers, use a class table instead:

| Class | Extends | Use Case |
|-------|---------|----------|
| **FooHelper** | BaseFoo | Primary use case |
| **BarHelper** | BaseFoo | Alternative use case |

#### Import Paths

```typescript
import { HelperClass } from '@venizia/ignis-helpers';
import type { IHelperOptions } from '@venizia/ignis-helpers';
```

## Creating an Instance

```typescript
const helper = new HelperClass({
  option1: 'value',
  option2: true,
});
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `option1` | `string` | -- | Required. Description |
| `option2` | `boolean` | `true` | Optional. Description |

> [!NOTE]
> Add notes about required dependencies, environment variables, or runtime constraints here.

## Usage

### {Feature Area 1}

```typescript
// Realistic usage example
await helper.doSomething({ param: 'value' });
```

### {Feature Area 2}

```typescript
// Another realistic usage example
const result = helper.anotherMethod({ key: 'value' });
```

## API Summary

> Only include this section if the helper has 8+ public methods.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `method1()` | `opts: { key: string }` | `Promise<void>` | Does X |
| `method2()` | `opts: { id: number }` | `Result` | Does Y |

## Troubleshooting

### "Exact error message from source code"

**Cause:** What triggers this error.

**Fix:**
```typescript
// Corrected code or configuration
```

### Another common issue

**Cause:** Explanation.

**Fix:** Steps or code to resolve.

## See Also

- [Related Helper](../related-helper/) -- Brief description
- [Guide Topic](/guides/core-concepts/relevant-guide) -- Brief description
- [External Link](https://example.com) -- Brief description
````

---

## Section Rules

| Section | Required | Notes |
|---------|----------|-------|
| Quick Reference | Yes | Always first after title |
| Import Paths | Yes | As `####` sub-heading under Quick Reference |
| Creating an Instance | Yes | Constructor + full options table |
| Usage | Yes | Organized by feature area with `###` sub-headings |
| API Summary | No | Only for helpers with 8+ public methods |
| Troubleshooting | Yes | 2-5 common errors from source `throw` statements |
| See Also | Yes | Categorized links to related docs |

## Content Rules

1. All content sourced from actual source code -- no inventing methods, options, or behaviors
2. Show realistic parameter examples (not `'foo'` or `'bar'`)
3. Use `<code v-pre>` for any `{{ }}` template patterns
4. No `::: details` containers -- use `####` sub-headings
5. No emojis
6. GitHub-style callouts only: `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!IMPORTANT]`
