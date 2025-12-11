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
| `@venizia/ignis-helpers` | Utility helpers - logging, cron, Redis, queues, storage |
| `@venizia/ignis-inversion` | Dependency Injection & IoC container |
| `@venizia/dev-configs` | Shared ESLint, Prettier, TypeScript configurations |
| `@venizia/ignis-docs` | Documentation and MCP Server |

---

## Third-Party Dependencies

Ignis uses the following open-source libraries. We are grateful to the authors and contributors of these projects.

### Core Dependencies

| Library | License | Description |
|---------|---------|-------------|
| [Hono](https://github.com/honojs/hono) | MIT | Ultrafast web framework |
| [Zod](https://github.com/colinhacks/zod) | MIT | TypeScript-first schema validation |
| [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) | Apache-2.0 | TypeScript ORM |
| [Jose](https://github.com/panva/jose) | MIT | JavaScript Object Signing and Encryption |

### Helpers Dependencies

| Library | License | Description |
|---------|---------|-------------|
| [Winston](https://github.com/winstonjs/winston) | MIT | Universal logging library |
| [BullMQ](https://github.com/taskforcesh/bullmq) | MIT | Message queue and job scheduling |
| [IORedis](https://github.com/redis/ioredis) | MIT | Redis client for Node.js |
| [MinIO](https://github.com/minio/minio-js) | Apache-2.0 | S3-compatible object storage client |
| [Axios](https://github.com/axios/axios) | MIT | HTTP client |
| [Day.js](https://github.com/iamkun/dayjs) | MIT | Date manipulation library |
| [Cron](https://github.com/kelektiv/node-cron) | MIT | Cron job scheduler |
| [Socket.IO](https://github.com/socketio/socket.io) | MIT | Real-time bidirectional communication |
| [MQTT.js](https://github.com/mqttjs/MQTT.js) | MIT | MQTT client |

### Utility Dependencies

| Library | License | Description |
|---------|---------|-------------|
| [Lodash](https://github.com/lodash/lodash) | MIT | Utility library |
| [reflect-metadata](https://github.com/rbuckton/reflect-metadata) | Apache-2.0 | Metadata reflection API |

### Documentation Dependencies

| Library | License | Description |
|---------|---------|-------------|
| [VitePress](https://github.com/vuejs/vitepress) | MIT | Static site generator |
| [Fuse.js](https://github.com/krisk/fuse) | Apache-2.0 | Fuzzy search library |
| [gray-matter](https://github.com/jonschlinkert/gray-matter) | MIT | Front-matter parser |

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
