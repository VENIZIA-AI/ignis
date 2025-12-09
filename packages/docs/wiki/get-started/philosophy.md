# Philosophy: The Best of Two Worlds

Ignis combines the structured, enterprise-grade development experience of **LoopBack 4** with the speed and simplicity of **Hono**.

## The Problem

When building REST APIs with Node.js/Bun, developers face a choice:

| Aspect | Minimal Frameworks | Enterprise Frameworks | **Ignis** |
|--------|-------------------|----------------------|-----------|
| **Examples** | Express, Hono, Fastify | NestJS, LoopBack | **Ignis** |
| **Performance** | ⚡ Very fast | 🐌 Slower | ⚡ Very fast (Hono) |
| **Architecture** | ❌ No structure | ✅ Structured | ✅ Structured |
| **Learning Curve** | ✅ Easy | ❌ Steep | ✅ Gradual |
| **Dependency Injection** | ❌ Manual | ✅ Built-in | ✅ Built-in |
| **Boilerplate** | ✅ Minimal | ❌ Heavy | ✅ Moderate |
| **Best For** | Prototypes, tiny APIs | Large enterprise apps | Growing APIs, teams |

### Ignis: The Middle Ground

Ignis provides the architectural benefits of enterprise frameworks while maintaining Hono's speed:

- ✅ **Enterprise patterns** (DI, layered architecture) without the bloat
- ✅ **Hono's performance** - one of the fastest frameworks
- ✅ **Gradual complexity** - start simple, add structure as you grow
- ✅ **TypeScript-first** with excellent type safety

## Inspired By The Best

### From LoopBack 4

[LoopBack 4](https://loopback.io/doc/en/lb4/index.html) proved that enterprise patterns work:

| Pattern | Benefit |
|---------|---------|
| **Dependency Injection** | Loosely coupled, testable code |
| **Layered Architecture** | Clear separation (Controllers → Services → Repositories) |
| **Component-Based** | Modular, reusable features |
| **Decorators** | Declarative metadata for routes and DI |

### From Hono

[Hono](https://hono.dev/) provides the performance foundation:

| Feature | Why It Matters |
|---------|----------------|
| **Ultrafast** | One of the fastest web frameworks |
| **Lightweight** | Minimal core, fast startup |
| **Modern API** | Clean, intuitive developer experience |
| **Multi-Runtime** | Works on Node.js, Bun, Deno, Cloudflare Workers |

### The Ignis Synthesis

Ignis = LoopBack patterns + Hono performance:

```
┌─────────────────┐      ┌──────────────┐      ┌──────────────┐
│  LoopBack 4     │  +   │    Hono      │  =   │    Ignis     │
│                 │      │              │      │              │
│ • DI Container  │      │ • Speed      │      │ • DI + Speed │
│ • Layered Arch  │      │ • Minimal    │      │ • Structure  │
│ • Components    │      │ • Modern API │      │ • Components │
└─────────────────┘      └──────────────┘      └──────────────┘
```

**What you get:**
- Familiar structure for LoopBack/NestJS developers
- Hono's performance and flexibility
- Pre-built components (auth, logging, database, etc.)

## When Should You Use Ignis?

### Decision Matrix

| Your Situation | Use Ignis? | Why |
|----------------|------------|-----|
| Building 10+ endpoint API | ✅ Yes | Structure prevents spaghetti code |
| Team of 2+ developers | ✅ Yes | Patterns improve collaboration |
| Need database + auth + docs | ✅ Yes | Built-in components save time |
| Coming from NestJS/LoopBack | ✅ Yes | Familiar patterns, better performance |
| Prototyping quickly | ❌ No | Use plain Hono for speed |
| Simple proxy/webhook | ❌ No | Too much structure |
| 3-5 endpoints, solo dev | 🤔 Maybe | Start with Hono, migrate later if needed |

### ✅ Perfect For

**E-commerce Backends:**
- Controllers for products, orders, users, payments
- Services for business logic (tax, inventory)
- Repository pattern for data access
- JWT authentication + OpenAPI docs

**SaaS Platform APIs:**
- Multi-tenant architecture
- Complex business rules
- Modular components
- Easy testing with DI

**Enterprise Tools:**
- CRUD operations via `ControllerFactory`
- Team collaboration with clear patterns
- Type-safe database operations
- Automatic validation

## The Trade-off

| You Gain | You Give Up |
|----------|-------------|
| Clear architecture | ~100 lines setup boilerplate |
| Built-in DI, validation, docs | Learning curve for patterns |
| Faster for medium/large projects | Slightly more abstraction than Hono |
| Easier testing | Initial time investment |
| Team scalability | Convention over total freedom |

**Bottom line:** If you're building more than a simple API, the structure pays off in maintainability and productivity.

## Next Steps

Ready to get started?

1. [Check Prerequisites](./prerequisites.md) - Install required tools
2. [Quickstart Guide](./quickstart.md) - Build your first endpoint
3. [CRUD Tutorial](./building-a-crud-api.md) - Build a complete API
