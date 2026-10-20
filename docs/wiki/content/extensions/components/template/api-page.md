# API Reference Page Template (Tier 2 -- api.md)

The "understand it deeply" page. A developer reads this on Day 30 when they need to understand how the component works internally, debug edge cases, or extend behavior. Contains architecture diagrams, full method signatures, internal lifecycle, and type definitions.

Paired with [Setup](./setup-page), [Usage](./usage-page), and [Error Reference](./errors-page).

## When to Use

Always created alongside the other 3 pages for Tier 2 components.

## Page Structure

```markdown
# {Component Name} -- API Reference

> Architecture, method signatures, and internals for the [{Component Name}](./) component.

## Architecture

` ``
  ┌─────────────────┐
  │   Application    │
  └────────┬────────┘
           │ registers
           ▼
  ┌─────────────────┐     ┌──────────────┐
  │   Component      │────▶│    Helper     │
  └─────────────────┘     └──────────────┘
` ``

### {Flow Name} (e.g., "Authentication Flow", "Message Delivery Flow")

1. Step-by-step explanation of the data flow
2. What happens at each stage
3. How components interact

## {Public API Section} (e.g., "Server Helper API", "Strategy Registry")

### `methodName()`

` ``typescript
methodName(opts: { param: Type }): ReturnType
` ``

| Parameter | Type | Description |
|-----------|------|-------------|
| `param` | `Type` | What it controls |

**Returns:** Description of return value.

### `anotherMethod()`

` ``typescript
anotherMethod(): void
` ``

Description of what this method does.

## Types Reference

### `IInterfaceName`

` ``typescript
interface IInterfaceName {
  field: string;
  optional?: number;
}
` ``

| Field | Type | Description |
|-------|------|-------------|
| `field` | `string` | What it represents |
| `optional` | `number` | Optional description |

## Internals

### Component Lifecycle

`BaseComponent` gives every component exactly two hooks. Do not document a third.

1. **`constructor()`** -- Receives the application via `@inject`. STORES the default `Binding` objects; it applies none of them yet
2. **`configure(opts?)`** -- Runs at the `registerComponents` boot step. Applies the stored defaults through `initDefaultBindings()`, filling only keys nothing else took, then calls `binding()`. This is the only hook that sees the options from `this.component(Class, { options })`. Override it when the component must bind those options itself; call `super.configure(opts)` last
3. **`binding()`** -- Abstract, so every component implements it. Registers services, providers, controllers and routes with the DI container
4. **Post-start hook** -- Registered from `binding()` via `application.registerPostStartHook()`, for work that needs a running server (if applicable)

> [!NOTE]
> `resolveBindings()` is not a base-class hook. It is a private helper two components happen to
> define for themselves. Name it only on those pages, as an internal, never as part of the contract.

### {Internal Mechanism} (e.g., "Token Encryption", "Redis Channel Architecture")

Detailed explanation of a key internal mechanism.

` ``typescript
// Key implementation code
` ``

### {Another Internal}

Description and code.

## See Also

- [Setup & Configuration](./) -- Quick reference, setup steps, configuration options
- [Usage & Examples](./usage) -- Usage patterns, examples, API endpoints
- [Error Reference](./errors) -- Error tables and troubleshooting

- **Guides:**
  - [Components](/guides/core-concepts/components) - Component system overview

- **Components:**
  - [All Components](../index) - Built-in components list
```

## Rules

- **File name:** Always `api.md` inside the component directory
- **Focus:** How it works internally. Architecture, methods, types, lifecycle
- **Architecture section:** Required. Use ASCII art or Mermaid diagrams. Focus on data flow and component relationships
- **Method signatures:** Show full TypeScript signatures with parameter tables
- **Types Reference:** Include all public interfaces and types. Show the full interface definition plus a field description table
- **Internals:** Explain the component lifecycle and key internal mechanisms. Include relevant source code snippets
- **No setup steps** on this page -- those are in `index.md`
- **No usage examples** on this page -- those are in `usage.md`
- **No API endpoint specs** on this page -- those are in `usage.md`
- **No error tables** on this page -- those are in `errors.md`
- **No troubleshooting** on this page -- those are in `errors.md`
- **No collapsible sections** -- show all content directly using `####` sub-headings for source code, verbose explanations
- Use `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!IMPORTANT]` callouts
