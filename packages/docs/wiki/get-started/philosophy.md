# Philosophy: The Best of Two Worlds

Ignis combines the structured, enterprise-grade development experience of **LoopBack 4** with the speed and simplicity of **Hono**.

## The Landscape

When building REST APIs with Node.js/Bun, developers choose from three categories of frameworks, each with genuine strengths:

### Framework Categories

| Category | Examples | Philosophy |
|----------|----------|------------|
| **Minimal** | Express, Hono, Fastify, Koa | Freedom, speed, flexibility |
| **Enterprise** | NestJS, LoopBack 4, AdonisJS | Structure, patterns, conventions |
| **Balanced** | Ignis, Ts.ED | Structure with lighter footprint |

## Honest Comparison

### Performance & Runtime

| Framework | Requests/sec | Startup Time | Memory | Multi-Runtime |
|-----------|-------------|--------------|--------|---------------|
| **Hono** | ~150k | ~10ms | ~20MB | ✅ Bun, Node, Deno, CF Workers |
| **Fastify** | ~80k | ~50ms | ~40MB | Node only |
| **Express** | ~15k | ~100ms | ~50MB | Node only |
| **NestJS** | ~25k | ~500ms | ~100MB | Node (Bun experimental) |
| **LoopBack 4** | ~20k | ~800ms | ~120MB | Node only |
| **Ignis** | ~140k | ~30ms | ~30MB | ✅ Bun, Node |

*Benchmarks are approximate and vary by use case.*

### Developer Experience

| Aspect | Minimal (Hono/Express) | Enterprise (NestJS/LoopBack) | Ignis |
|--------|------------------------|------------------------------|-------|
| **Setup Time** | 5 minutes | 30+ minutes | 10 minutes |
| **Learning Curve** | Low | High | Medium |
| **Boilerplate** | Minimal | Heavy | Moderate |
| **Type Safety** | Manual | Excellent | Excellent |
| **IDE Support** | Basic | Excellent | Good |
| **Documentation** | Good | Excellent | Growing |

### Architecture & Patterns

| Pattern | Minimal | Enterprise | Ignis |
|---------|---------|------------|-------|
| **Dependency Injection** | ❌ Manual/3rd party | ✅ Built-in (complex) | ✅ Built-in (simple) |
| **Layered Architecture** | ❌ DIY | ✅ Enforced | ✅ Guided |
| **Repository Pattern** | ❌ DIY | ✅ Built-in | ✅ Built-in |
| **Validation** | ❌ 3rd party | ✅ Built-in | ✅ Built-in (Zod) |
| **OpenAPI/Swagger** | ❌ 3rd party | ✅ Built-in | ✅ Built-in |
| **Authentication** | ❌ DIY | ✅ Modules available | ✅ Built-in component |

### Ecosystem & Maturity

| Aspect | Minimal (Hono) | Enterprise (NestJS) | Ignis |
|--------|----------------|---------------------|-------|
| **Community Size** | Growing fast | Very large | Small |
| **npm Downloads** | ~500k/week | ~3M/week | New |
| **Stack Overflow** | Limited | Extensive | Limited |
| **Third-party Modules** | Middleware-based | Rich ecosystem | Growing |
| **Production Battle-tested** | Yes | Yes | Emerging |
| **Corporate Backing** | Cloudflare | Trilon | Independent |

### Flexibility vs Convention

| Aspect | Minimal | Enterprise | Ignis |
|--------|---------|------------|-------|
| **Project Structure** | Total freedom | Strict conventions | Guided conventions |
| **ORM Choice** | Any | TypeORM/Prisma preferred | Drizzle (flexible) |
| **Testing Approach** | Any | Jest recommended | Any |
| **Middleware System** | Simple | Complex interceptors | Hono middleware |
| **Customization** | Unlimited | Plugin-based | Component-based |

## The Middle Ground: Where Ignis Fits

### What Each Approach Excels At

**Minimal Frameworks (Hono, Express, Fastify):**
- ✅ Maximum performance
- ✅ Complete freedom in architecture
- ✅ Fastest prototyping
- ✅ Smallest bundle size
- ✅ Edge/serverless deployments
- ⚠️ Architecture decisions left to developer
- ⚠️ Patterns must be implemented manually

**Enterprise Frameworks (NestJS, LoopBack):**
- ✅ Battle-tested patterns
- ✅ Comprehensive documentation
- ✅ Large community & ecosystem
- ✅ Excellent for large teams
- ✅ Strong conventions prevent chaos
- ⚠️ Higher resource consumption
- ⚠️ Steeper learning curve
- ⚠️ More boilerplate

**Ignis (The Middle Ground):**
- ✅ Enterprise patterns without the weight
- ✅ Hono's performance foundation
- ✅ Gradual complexity adoption
- ✅ TypeScript-first with Zod validation
- ⚠️ Smaller community (new framework)
- ⚠️ Less documentation than mature frameworks
- ⚠️ Fewer third-party integrations

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

## Choose the Right Tool

### Use Hono/Fastify/Express When:

| Scenario | Why It's Better |
|----------|-----------------|
| Building a simple webhook handler | No structure overhead needed |
| Edge/serverless functions | Minimal cold start, tiny bundle |
| Rapid prototyping | Get something running in minutes |
| Microservices with 1-5 endpoints | Structure adds unnecessary complexity |
| You want maximum control | No conventions to follow |
| Learning web development | Simpler mental model |

### Use NestJS/LoopBack When:

| Scenario | Why It's Better |
|----------|-----------------|
| Large team (10+ developers) | Strong conventions prevent chaos |
| Enterprise with strict standards | Mature, battle-tested, auditable |
| Need extensive ecosystem | Many official and community modules |
| Complex microservices architecture | Built-in support for messaging, CQRS |
| Hiring developers easily | Large talent pool familiar with it |
| Long-term support is critical | Corporate backing, LTS versions |

### Use Ignis When:

| Scenario | Why It's Better |
|----------|-----------------|
| Medium-sized API (10-100 endpoints) | Right balance of structure and speed |
| Small team wanting patterns | DI without enterprise complexity |
| Performance is critical | Hono's speed with structure |
| Coming from LoopBack/NestJS | Familiar patterns, lighter weight |
| Bun-first development | Native Bun support |
| Growing project | Start simple, add complexity gradually |

## The Trade-off

Every choice has trade-offs. Here's an honest look:

### What You Gain with Ignis

| Benefit | Compared To |
|---------|-------------|
| ~5x faster than NestJS | Enterprise frameworks |
| Built-in DI, validation, OpenAPI | Minimal frameworks |
| Structured codebase | DIY architecture |
| Easier testing with DI | Manual mocking |
| Team-friendly patterns | Individual coding styles |

### What You Give Up with Ignis

| Trade-off | Compared To |
|-----------|-------------|
| ~10% slower than raw Hono | Minimal frameworks |
| Smaller community | NestJS/Express |
| Less documentation | Mature frameworks |
| Learning curve for patterns | No-structure approach |
| Convention requirements | Total freedom |

### Honest Assessment

| Aspect | Ignis Reality |
|--------|---------------|
| **Maturity** | New framework, evolving API |
| **Community** | Small but growing |
| **Documentation** | Good but not comprehensive |
| **Production Use** | Early adopters only |
| **Breaking Changes** | Possible before v1.0 |
| **Support** | Community-driven |

**Bottom line:** Ignis is ideal for developers who want enterprise patterns without enterprise overhead. If you need battle-tested stability and extensive community support, consider NestJS. If you need maximum simplicity, stick with Hono.

## Migration Paths

### From Hono to Ignis

If your Hono project grows complex:

```
1. Add Ignis as dependency
2. Wrap existing Hono app with Ignis Application
3. Gradually introduce DI for new features
4. Migrate routes to controllers over time
```

### From NestJS to Ignis

If you want better performance:

```
1. Controllers → Ignis Controllers (similar decorators)
2. Services → Ignis Services (same pattern)
3. Repositories → Ignis Repositories (Drizzle instead of TypeORM)
4. Modules → Ignis Components (simpler structure)
```

### From Ignis to NestJS

If you outgrow Ignis:

```
1. Patterns are similar - migration is straightforward
2. Main changes: ORM, module system, interceptors
3. DI concepts transfer directly
```

## Next Steps

Ready to get started?

1. [Check Prerequisites](./prerequisites.md) - Install required tools
2. [Quickstart Guide](./quickstart.md) - Build your first endpoint
3. [CRUD Tutorial](./building-a-crud-api.md) - Build a complete API
