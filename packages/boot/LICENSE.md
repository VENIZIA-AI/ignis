# Ignis Boot License

Part of the Ignis Framework - a TypeScript Server Infrastructure built on [Hono](https://hono.dev/).

## MIT License

Copyright (c) 2025 VENIZIA Ltd. Co.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## About @venizia/ignis-boot

This package provides application bootstrapping and artifact auto-discovery for Ignis applications.

**Key Features:**
- Automatic discovery and loading of controllers, services, repositories, and datasources
- Convention-based configuration
- Extensible booter system
- Minimal overhead with performance tracking

---

## Dependencies

This package uses the following open-source libraries:

| Library | License | Description |
|---------|---------|-------------|
| [@venizia/ignis-helpers](https://github.com/VENIZIA-AI/ignis) | MIT | Ignis utility helpers |
| [@venizia/ignis-inversion](https://github.com/VENIZIA-AI/ignis) | MIT | Ignis DI/IoC container |
| [glob](https://github.com/isaacs/node-glob) | ISC | File pattern matching |
| [lodash](https://github.com/lodash/lodash) | MIT | Utility library |
| [reflect-metadata](https://github.com/rbuckton/reflect-metadata) | Apache-2.0 | Metadata reflection API |
| [zod](https://github.com/colinhacks/zod) | MIT | TypeScript-first schema validation |

---

## Related Packages

Part of the Ignis monorepo:

| Package | Description |
|---------|-------------|
| `@venizia/ignis` | Core framework - controllers, services, decorators |
| `@venizia/ignis-boot` | **This package** - Application bootstrapping |
| `@venizia/ignis-helpers` | Utility helpers - logging, cron, Redis, queues, storage |
| `@venizia/ignis-inversion` | Dependency Injection & IoC container |
| `@venizia/dev-configs` | Shared ESLint, Prettier, TypeScript configurations |
| `@venizia/ignis-docs` | Documentation and MCP Server |

---

## Contributing

By contributing to Ignis, you agree that your contributions will be licensed under the MIT License.

For more information, visit: https://venizia-ai.github.io/ignis
