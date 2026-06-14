# Usage & Examples Page Template (Tier 2 -- usage.md)

The "use it effectively" page. A developer reads this on Day 2 when they have the component running and need to integrate it into their application. Contains Step 3 from the setup flow, usage patterns, API endpoint specifications, and integration examples.

Paired with [Setup](./setup-page), [API Reference](./api-page), and [Error Reference](./errors-page).

## When to Use

Always created alongside the other 3 pages for Tier 2 components.

## Page Structure

```markdown
# {Component Name} -- Usage & Examples

> Usage patterns, integration examples, and API specifications for the [{Component Name}](./) component.

## Using the Component

Content from "Step 3" -- how downstream code interacts with what the component provides.

### {Primary Usage Pattern}

` ``typescript
// Main way to use this component
` ``

### {Secondary Usage Pattern}

` ``typescript
// Alternative usage
` ``

## {Feature Section} (repeat as needed)

Group usage examples by feature when the component has multiple capabilities.

### {Sub-feature}

` ``typescript
// Feature example
` ``

> [!TIP]
> {Best practice or recommendation}

## API Endpoints

> Only include if the component registers REST routes.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/path` | Yes/No | What it does |
| `GET` | `/path` | Yes/No | What it returns |

### POST /path

**Request body:**

` ``json
{
  "field": "value"
}
` ``

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `field` | `string` | Yes | Min 1, max 255 |

**Response `200`:**

` ``json
{
  "result": "value"
}
` ``

### GET /path

**Response `200`:**

` ``json
{
  "data": []
}
` ``

## {Integration Section} (optional)

### Frontend Integration

` ``typescript
// Client-side integration example
` ``

### {Advanced Pattern}

` ``typescript
// Advanced usage pattern
` ``

## See Also

- [Setup & Configuration](./) -- Quick reference, setup steps, configuration options
- [API Reference](./api) -- Architecture, method signatures, internals
- [Error Reference](./errors) -- Error tables and troubleshooting

- **Guides:**
  - [Components](/guides/core-concepts/components) - Component system overview

- **Components:**
  - [All Components](../index) - Built-in components list
```

## Rules

- **File name:** Always `usage.md` inside the component directory
- **Focus:** How to use the component after setup. Patterns, examples, flows, endpoints
- **Step 3 content lives here** -- the "Use in Services" part of the setup flow
- **API Endpoints:** Full request/response specifications go here, not in `api.md`. Show all status codes, all fields, all constraints
- **No setup steps** on this page -- those are in `index.md`
- **No architecture diagrams** on this page -- those go in `api.md`
- **No error tables** on this page -- those go in `errors.md`
- **Feature grouping:** When a component has multiple features (e.g., template engine, queue executors, verification generators), use `##` sections for each
- **Code-heavy page** -- every pattern should have a code example
- **No collapsible sections** -- show all content directly using `####` sub-headings
- Use `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, `> [!IMPORTANT]` callouts
