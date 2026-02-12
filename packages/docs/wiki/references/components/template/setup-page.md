# Setup & Configuration Page Template (Tier 2 -- index.md)

The "get it working" page for complex components. Everything a developer needs on Day 1: what the component is, how to install it, how to configure it, and what binding keys it uses.

Paired with [Usage](./usage-page), [API Reference](./api-page), and [Error Reference](./errors-page).

## When to Use

- Component has 6+ configuration options or multiple config groups
- Setup involves strategy selection, multiple providers, or multi-step integration
- There's enough depth to warrant separate Usage, API, and Error pages

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

| Sub-component | Purpose |
|---------------|---------|
| **ClassA** | What it does |
| **ClassB** | What it does |

#### Import Paths

` ``typescript
import { ComponentClass, BindingKeys } from '@venizia/ignis';
import type { IConfigOptions } from '@venizia/ignis';
` ``

## Setup

### Step 1: Bind Configuration

Show the minimum viable setup first, then variants.

` ``typescript
// Minimal setup
this.bind<IConfigType>({ key: Keys.CONFIG }).toValue({
  // required fields only
});
` ``

> [!TIP]
> {Optional: point to other setup variants if applicable}

#### Alternative: {Variant Name} Setup

` ``typescript
// Full variant setup
` ``

### Step 2: Register Component

` ``typescript
this.component(ComponentClass);
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
| `@app/ns/key` | `Keys.CONSTANT` | `Type` | Yes/No | value or `--` |

> [!NOTE]
> {Any important notes about binding order or conditional requirements}

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
