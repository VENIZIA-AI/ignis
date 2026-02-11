# Binding Keys

Lists every DI binding key the component uses. Required for all components.

## Structure

```markdown
## Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/ns/key` | `Keys.CONSTANT` | `Type` | Yes | -- |
```

## Rules

- Source all keys from the component's `keys.ts` file
- **Key** — The actual string value (e.g., `@app/authenticate/strategy`)
- **Constant** — The code constant (e.g., `AuthenticateKeys.STRATEGY`)
- **Type** — The TypeScript type bound to that key
- **Required** — Whether the app must bind this key or the component provides a default
- **Default** — The default value if not required, or `--` if no default

## Where to Find Keys

```
packages/core/src/components/{name}/common/keys.ts
```

## Example

From the Authentication component:

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/authenticate/strategy` | `AuthenticateKeys.STRATEGY` | `TAuthStrategy` | Yes | -- |
| `@app/authenticate/jwt-secret` | `AuthenticateKeys.JWT_SECRET` | `string` | Yes (JWT) | -- |
| `@app/authenticate/excluded-paths` | `AuthenticateKeys.EXCLUDED_PATHS` | `string[]` | No | `[]` |
