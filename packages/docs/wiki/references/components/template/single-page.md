# Single-Page Component Template (Tier 1)

For simple components with few configuration options and straightforward behavior (e.g., Health Check, Request Tracker, Swagger). Everything fits on one page.

## When to Use

- Component has 5 or fewer configuration options
- No complex architecture worth diagramming
- Behavior is self-explanatory from setup alone

## Page Structure

```markdown
# {Component Name}

{One-line description of what this component does.}

> [!IMPORTANT]
> {Only if there's a critical runtime/dependency note. Remove entirely if not needed.}

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `{ComponentClass}` |
| **Helper** | [`{HelperClass}`](/references/helpers/{slug}) |
| **Runtimes** | Both / Bun only |

#### Import Paths

` ``typescript
import { ComponentClass, BindingKeys } from '@venizia/ignis';
import type { IConfigOptions } from '@venizia/ignis';
` ``

## Setup

### Step 1: Bind Configuration

` ``typescript
this.bind<IConfigType>({ key: Keys.CONFIG }).toValue({
  // minimal config here
});
` ``

### Step 2: Register Component

` ``typescript
this.component(ComponentClass);
` ``

### Step 3: Use

` ``typescript
// How downstream code interacts with the component
` ``

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `option` | `string` | `'default'` | What it controls |

#### {IConfigType} -- Full Reference

` ``typescript
interface IConfigType {
  // full interface
}
` ``

## Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/ns/key` | `Keys.CONSTANT` | `Type` | Yes/No | value or `--` |

## API Endpoints

> Only include if the component exposes REST routes. Remove entirely if not.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/path` | What it returns |

#### Request & Response Schemas

**GET /path**

Response `200`:
` ``json
{ "status": "ok" }
` ``

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

## See Also

- **Guides:**
  - [Components](/guides/core-concepts/components) - Component system overview

- **Components:**
  - [All Components](./index) - Built-in components list
```

## Rules

- **One page, one component.** No sub-pages, no sub-directories.
- **File name:** `{component-slug}.md` (e.g., `health-check.md`, `swagger.md`)
- **Quick Reference helper row:** Only include if the component wraps a helper class.
- **API Endpoints section:** Only include if the component registers REST routes. Remove entirely otherwise.
- **Troubleshooting:** Minimum 2 entries, maximum 5.
- **See Also:** Inline at the bottom -- no separate page.
- **No collapsible sections** -- show all content directly using `####` sub-headings for verbose content (full interfaces, controller source, request/response schemas).
- Use `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!IMPORTANT]` callouts.
