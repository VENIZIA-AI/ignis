# @venizia/ignis

[![npm version](https://img.shields.io/npm/v/@venizia/ignis.svg)](https://www.npmjs.com/package/@venizia/ignis)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The core package of the **Ignis Framework** - a TypeScript Server Infrastructure combining enterprise-grade patterns with high performance, built on [Hono](https://hono.dev/).

## Installation

```bash
bun add @venizia/ignis
# or
npm install @venizia/ignis
```

### Peer Dependencies

```bash
bun add hono @hono/zod-openapi @scalar/hono-api-reference drizzle-orm drizzle-zod pg jose
```

## Quick Example

```typescript
import { BaseApplication, BaseController, controller, get, HTTP, jsonContent } from "@venizia/ignis";
import { z } from "@hono/zod-openapi";

@controller({ path: "/hello" })
class HelloController extends BaseController {
  constructor() {
    super({ scope: "HelloController", path: "/hello" });
  }

  override binding() {}

  @get({
    configs: {
      path: "/",
      method: HTTP.Methods.GET,
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
          description: "Says hello",
          schema: z.object({ message: z.string() }),
        }),
      },
    },
  })
  sayHello(c: Context) {
    return c.json({ message: "Hello from Ignis!" }, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

## About Ignis

Ignis brings together the structured, enterprise development experience of **LoopBack 4** with the blazing speed and simplicity of **Hono** - giving you the best of both worlds.

## Documentation

- [Ignis Repository](https://github.com/venizia-ai/ignis)
- [Getting Started](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/get-started/index.md)
- [Core Concepts](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/get-started/core-concepts/application.md)

## License

MIT
