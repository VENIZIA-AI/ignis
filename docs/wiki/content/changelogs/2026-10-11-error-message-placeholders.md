---
title: Error Messages Fill Their Placeholders
description: "The error response's message fills each %{key} from normalized.args, so a client with no translation for the code shows readable text. normalized.text, Error.message and the log keep the template."
packages: ['@venizia/ignis-inversion', '@venizia/ignis-kernel']
---

# Changelog - 2026-10-11

## Error messages fill their placeholders

<Badge type="tip" text="Enhancement" /> <Badge type="warning" text="Behavior Change" />

**In one line.** The response `message` of an intentional error is ready to show.

```typescript
throw getError({
  message: { text: 'Only %{available} left of %{variantId}.', code: 'stock.unavailable' },
  messageArgs: { available: 2, variantId: 'V1' },
  statusCode: 409,
});
```

```json
{
  "message": "Only 2 left of V1.",
  "normalized": {
    "text": "Only %{available} left of %{variantId}.",
    "code": "stock.unavailable",
    "args": { "available": 2, "variantId": "V1" }
  }
}
```

Before, `message` was the raw template, so a client that fell back to `message` showed `%{available}` to the user.

## What changed

- **`message` is filled.** The error middleware replaces each `%{key}` with `String(args[key])` from `normalized.args`.
- **`normalized.text` keeps the template.** A client that translates `code` + `args` works unchanged. A `transform` still changes only `normalized.text`.
- **`Error.message` and the log keep the template.** An arg value stays in the `args` map, where the log redacts secret-shaped keys.
- **A missing arg stays as written.** Outside production, the middleware logs one warning naming the code and the missing keys. Production stays silent.
- **Only an intentional error is filled.** A validation, database or unexpected error writes its own text, unchanged. A route error inside a Worker host answers the same body.

## Who is affected

- **A client that shows `message`.** It now shows readable text. No change needed.
- **A client or test that compares `message` with the catalog template.** Compare `normalized.text` instead, or expect the filled text.

See [Read the error response shape](/extensions/helpers/error/#read-the-error-response-shape).
