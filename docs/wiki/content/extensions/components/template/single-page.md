# Single-Page Component Template (Tier 1)

For simple components with few configuration options and straightforward behavior (e.g., Health Check, Request Tracker, API Reference). Everything fits on one page.

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
| **Helper** | [`{HelperClass}`](/extensions/helpers/{slug}) |
| **Runtimes** | Both / Bun only |

#### Import Paths

` ``typescript
// Root barrel. Mail, Socket.IO, WebSocket and Static Asset are NOT here -
// import those from '@venizia/ignis/{subpath}' instead.
import { ComponentClass, ComponentBindingKeys } from '@venizia/ignis';
import type { IConfigOptions } from '@venizia/ignis';
` ``

## Setup

### Step 1: Register the Component with Options

` ``typescript
this.component(ComponentClass, {
  options: {
    // minimal config here
  },
});
` ``

### Step 2: Bind Anything the Options Cannot Carry

Only if the component reads separate keys. Order inside `preConfigure()` is free - see Binding Keys.

` ``typescript
this.bind<IConfigType>({ key: ComponentBindingKeys.CONFIG }).toValue({
  // ...
});
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
| `@app/ns/key` | `ComponentBindingKeys.CONSTANT` | `Type` | Yes/No | value or `--` |

> [!NOTE]
> Binding order inside `preConfigure()` never matters. A component's constructor only STORES its
> default `Binding` objects; `initDefaultBindings()` applies them from inside `configure()`, which
> the boot sweep runs at the `registerComponents` step - four steps after `preConfigure()` returns.
> A `this.bind()` placed after `this.component(...)` still wins over the default. Options passed at
> the call site win over both.

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
- **File name:** `{component-slug}.md` (e.g., `health-check.md`, `api-reference.md`)
- **Check the import path against `packages/core-server/src/components/index.ts`.** Mail, Socket.IO, WebSocket and Static Asset are deliberately off the root barrel - each needs `@venizia/ignis/{subpath}`. Copying `from '@venizia/ignis'` for one of those gives the reader an import that does not resolve.
- **Quick Reference helper row:** Only include if the component wraps a helper class.
- **API Endpoints section:** Only include if the component registers REST routes. Remove entirely otherwise.
- **Troubleshooting:** Minimum 2 entries, maximum 5.
- **See Also:** Inline at the bottom -- no separate page.
- **No collapsible sections** -- show all content directly using `####` sub-headings for verbose content (full interfaces, controller source, request/response schemas).
- Use `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!IMPORTANT]` callouts.
