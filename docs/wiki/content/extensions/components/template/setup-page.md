# Setup & Configuration Page Template (Tier 2 -- index.md)

The "get it working" page for complex components. Everything a developer needs on Day 1: what the component is, how to install it, how to configure it, and what binding keys it uses.

Paired with [Usage](./usage-page), [API Reference](./api-page), and [Error Reference](./errors-page).

## When to Use

- Component has 6+ configuration options or multiple config groups
- Setup involves strategy selection, multiple providers, or multi-step integration
- There's enough depth to warrant separate Usage, API, and Error pages

## Page Structure

```markdown
# {Component Name} -- Setup & Configuration

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

| Sub-component | Purpose |
|---------------|---------|
| **ClassA** | What it does |
| **ClassB** | What it does |

#### Import Paths

` ``typescript
// Root barrel. Mail, Socket.IO, WebSocket and Static Asset are NOT here -
// import those from '@venizia/ignis/{subpath}' instead.
import { ComponentClass, ComponentBindingKeys } from '@venizia/ignis';
import type { IConfigOptions } from '@venizia/ignis';
` ``

## Setup

### Step 1: Register the Component with Options

Show the minimum viable setup first, then variants.

` ``typescript
this.component(ComponentClass, {
  options: {
    // required fields only
  },
});
` ``

> [!TIP]
> {Optional: point to other setup variants if applicable}

#### Alternative: {Variant Name} Setup

` ``typescript
// Full variant setup
` ``

### Step 2: Bind Anything the Options Cannot Carry

Keys a component reads separately - a handler callback, a shared connection - go through `bind()`.
Place them anywhere in `preConfigure()`; see the note under Binding Keys for why order is free.

` ``typescript
this.bind<IConfigType>({ key: ComponentBindingKeys.CONFIG }).toValue({
  // ...
});
` ``

> [!NOTE]
> Step 3 (using the component) is covered in [Usage & Examples](./usage).

## Configuration

Group options by logical sections when the component has multiple config interfaces.

### {Config Group 1} (`IConfigGroupOptions`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `option` | `string` | `'default'` | What it controls |

#### {IConfigGroupOptions} -- Full Reference

` ``typescript
interface IConfigGroupOptions {
  // full interface
}
` ``

### {Config Group 2} (`IConfigGroup2Options`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `option` | `string` | `'default'` | What it controls |

## Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/ns/key` | `ComponentBindingKeys.CONSTANT` | `Type` | Yes/No | value or `--` |

> [!NOTE]
> Binding order inside `preConfigure()` never matters. A component's constructor only STORES its
> default `Binding` objects; `initDefaultBindings()` applies them from inside `configure()`, which
> the boot sweep runs at the `registerComponents` step - four steps after `preConfigure()` returns.
> A `this.bind()` placed after `this.component(...)` still wins over the default. Options passed at
> the call site win over both. State conditional requirements here; do not invent an ordering rule.

## See Also

- [Usage & Examples](./usage) -- Usage patterns, examples, API endpoints
- [API Reference](./api) -- Architecture, method signatures, internals
- [Error Reference](./errors) -- Error tables and troubleshooting

- **Guides:**
  - [Components](/guides/core-concepts/components) - Component system overview

- **Components:**
  - [All Components](../index) - Built-in components list
```

## Rules

- **File name:** Always `index.md` inside a directory named after the component
- **Focus:** Getting the developer from zero to configured. Setup, config, keys
- **Check the import path against `packages/core-server/src/components/index.ts`.** Mail, Socket.IO, WebSocket and Static Asset are deliberately off the root barrel - each needs `@venizia/ignis/{subpath}`. Copying `from '@venizia/ignis'` for one of those gives the reader an import that does not resolve
- **Only Steps 1-2** on this page -- Step 3 (usage) goes in `usage.md`
- **No architecture diagrams** on this page -- those go in `api.md`
- **No internal lifecycle details** on this page -- those go in `api.md`
- **No error tables** on this page -- those go in `errors.md`
- **No troubleshooting** on this page -- those go in `errors.md`
- **Configuration groups:** When a component has multiple config interfaces, use `###` sub-headings per group
- **Setup variants:** Show minimal setup at the top level. Put alternative configurations under `####` sub-headings
- **See Also:** Always link to the 3 sibling pages first, then external links
- **No collapsible sections** -- show all content directly using `####` sub-headings for verbose content (full interfaces, alternative setups)
- Use `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!IMPORTANT]` callouts
