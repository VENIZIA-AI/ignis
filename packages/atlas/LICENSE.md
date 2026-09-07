# Ignis Framework License

Ignis is a TypeScript Server Infrastructure framework built on [Hono](https://hono.dev/).

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

## Packages

This monorepo contains the following packages, all licensed under MIT:

| Package | Description |
|---------|-------------|
| `@venizia/ignis` | Core framework - controllers, services, decorators |
| `@venizia/ignis-boot` | Application bootstrapping & artifact auto-discovery |
| `@venizia/ignis-helpers` | Utility helpers - logging, cron, Redis, queues, storage |
| `@venizia/ignis-inversion` | Dependency Injection & IoC container |
| `@venizia/dev-configs` | Shared ESLint, Prettier, TypeScript configurations |
| `@venizia/ignis-docs` | Documentation and MCP Server |

---

## Third-Party Dependencies

This package uses the following open-source libraries. We are grateful to the authors and contributors of these projects.

| Library | License | Description |
|---------|---------|-------------|
| [@venizia/ignis-helpers](https://github.com/VENIZIA-AI/ignis) | MIT | IGNIS utility helpers |
| [Zod](https://github.com/colinhacks/zod) | MIT | TypeScript-first schema validation |
| [@hono/zod-openapi](https://github.com/honojs/middleware) | MIT | OpenAPI wrapper for Hono, Zod-validated |

---

## Acknowledgments

Ignis Framework is inspired by and built upon the work of many open-source projects:

- **[Hono](https://hono.dev/)** by Yusuke Wada - The ultrafast web framework that powers Ignis
- **[LoopBack 4](https://loopback.io/)** by IBM/StrongLoop - Inspiration for the enterprise architecture patterns
- **[NestJS](https://nestjs.com/)** by Kamil Mysliwiec - Inspiration for decorator-based controllers
- **[InversifyJS](https://inversify.io/)** - Inspiration for the IoC container design

We thank all the maintainers and contributors of these projects for their excellent work.

---

## Contributing

By contributing to Ignis, you agree that your contributions will be licensed under the MIT License.
