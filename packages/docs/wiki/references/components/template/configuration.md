# Configuration Options

Shows the component's configurable options. Defaults are visible; full interface is collapsible.

## Structure

```markdown
## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | `'/health'` | Endpoint path |
| `verbose` | `boolean` | `false` | Include details |

::: details IConfigType — Full Reference
` ``typescript
interface IConfigType {
  path?: string;
  verbose?: boolean;
  // ... all fields
}
` ``

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| ... full table ... |
:::
```

## Rules

- **Top-level table** shows the most important options (5-8 max) with their defaults
- **`::: details` block** contains the full TypeScript interface and complete options table
- Skip the details block if the component has 5 or fewer options total
- Source all options, types, and defaults from `types.ts` in the component source
- Always show the actual default values, not "see source"

## Where to Find Options

```
packages/core/src/components/{name}/common/types.ts
```

## Tips

- If an option accepts a union type, list the values: `'jwt' \| 'basic'`
- If an option is a callback, show the signature: `(ctx: Context) => boolean`
- Group related options visually in the table (e.g., all auth options together)
