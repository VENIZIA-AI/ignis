# Glossary for Beginners

Quick reference for key terms in Ignis documentation.


## Core Framework Terms

| Term | Description |
|------|-------------|
| **Application** | Main entry point extending `BaseApplication`. Registers all components. |
| **Controller** | Handles HTTP requests, defines API endpoints (`@controller`, `@get`, `@post`) |
| **Service** | Contains business logic between controllers and repositories |
| **Repository** | Database operations for one entity (`find`, `create`, `updateById`, etc.) |
| **DataSource** | Database connection configuration (host, port, credentials) |
| **Model/Entity** | Defines data structure and relationships using Drizzle schema |
| **Component** | Reusable plugin that bundles related functionality |

```typescript
// Application registers everything
export class Application extends BaseApplication {
  preConfigure() {
    this.dataSource(PostgresDataSource);
    this.repository(TodoRepository);
    this.controller(TodoController);
  }
}

// Controller handles HTTP
@controller({ path: '/todos' })
export class TodoController extends BaseController {
  @get('/') async getAll() { return this.repository.find({}); }
}

// Repository handles database
@repository({ model: Todo, dataSource: PostgresDataSource })
export class TodoRepository extends DefaultCRUDRepository<typeof Todo.schema> {}
```

**Related:** [Application](./core-concepts/application.md) | [Controllers](./core-concepts/controllers.md) | [Services](./core-concepts/services.md) | [Repositories](../references/base/repositories.md)


## TypeScript & Pattern Terms

### Decorators
Annotations starting with `@` that add behavior to classes/methods.

| Decorator | Purpose |
|-----------|---------|
| `@controller` | Marks class as controller |
| `@model` | Marks class as model/entity |
| `@repository` | Marks class as repository |
| `@datasource` | Marks class as datasource |
| `@inject` | Requests dependency from container |
| `@get`, `@post`, `@patch`, `@delete` | HTTP route handlers |

### Dependency Injection (DI)
Classes receive dependencies from an external container instead of creating them internally. Benefits: testable, flexible, maintainable.

```typescript
// ❌ Without DI - creates own dependencies
class TodoController {
  private repository = new TodoRepository(new PostgresDataSource());
}

// ✅ With DI - receives from container
class TodoController {
  constructor(
    @inject({ key: 'repositories.TodoRepository' })
    private repository: TodoRepository
  ) {}
}
```

### Container & Binding
Container stores all dependencies. Binding registers classes/values under keys.

```typescript
// Register in Application
this.repository(TodoRepository);  // Key: 'repositories.TodoRepository'
this.bind({ key: 'config.apiKey' }).toValue('sk_live_xxx');

// Resolve via @inject
@inject({ key: 'repositories.TodoRepository' }) private repository: TodoRepository;
```

### Generic Types
TypeScript feature for reusable components: `<T>` or `<SomeType>`.

```typescript
class DefaultCRUDRepository<TSchema> { find(): TSchema[] { ... } }
class TodoRepository extends DefaultCRUDRepository<typeof Todo.schema> {}
```

**Related:** [Dependency Injection Guide](./core-concepts/dependency-injection.md)


## Database Terms

| Term | Description |
|------|-------------|
| **ORM** | Tool to work with databases using code instead of raw SQL. Ignis uses Drizzle ORM. |
| **Drizzle ORM** | Type-safe ORM library. [Docs](https://orm.drizzle.team/) |
| **Schema** | Table structure definition using Drizzle syntax |
| **Migration** | Script that creates/modifies tables. Version control for database structure. |
| **Connector** | Database driver that executes queries (via `dataSource.connector`) |
| **Relations** | Connections between tables (hasMany, belongsTo, hasOne) |

```typescript
// Schema definition
export const todoTable = pgTable('Todo', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  completed: boolean('completed').default(false),
});

// Relations
export const userRelations = createRelations({
  source: userTable,
  relations: [{ type: 'hasMany', model: () => Post, foreignKey: 'authorId' }],
});

// Query with relations
await userRepo.find({ filter: { include: [{ relation: 'posts' }] } });
```

```bash
# Migrations
bun run drizzle-kit generate  # Generate from schema changes
bun run migrate:dev           # Apply to database
```


## Query & Filter Terms

### Filter Object
Specifies what data to retrieve: `where`, `limit`, `order`, `include`.

```typescript
await repository.find({
  filter: {
    where: { status: 'active', age: { gte: 18 } },
    order: ['createdAt DESC'],
    limit: 10,
    include: [{ relation: 'author' }],
  }
});
```

### Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `eq` | Equal | `{ status: { eq: 'active' } }` |
| `ne` | Not equal | `{ status: { ne: 'deleted' } }` |
| `gt`, `gte` | Greater than (or equal) | `{ age: { gte: 18 } }` |
| `lt`, `lte` | Less than (or equal) | `{ price: { lt: 100 } }` |
| `like`, `ilike` | Pattern match | `{ name: { like: '%john%' } }` |
| `in`, `nin` | In list / not in list | `{ id: { in: [1, 2, 3] } }` |
| `between` | Range | `{ age: { between: [18, 65] } }` |

**Related:** [Filter System](../references/base/filter-system) | [Repositories](../references/base/repositories/)


## HTTP & API Terms

### REST API Methods

| Method | URL | Action |
|--------|-----|--------|
| GET | `/todos` | List all |
| GET | `/todos/:id` | Get one |
| POST | `/todos` | Create |
| PATCH | `/todos/:id` | Update |
| DELETE | `/todos/:id` | Delete |

```typescript
@controller({ path: '/todos' })
class TodoController {
  @get('/') async getAll() { ... }
  @get('/:id') async getById(@param('id') id: string) { ... }
  @post('/') async create(@body() data: CreateTodoDto) { ... }
}
```

| Term | Description |
|------|-------------|
| **Endpoint** | URL path that API responds to (e.g., `GET /todos`) |
| **Route Parameter** | Variable in URL marked with `:` (e.g., `:id`) |
| **Request Body** | JSON data sent with POST/PATCH requests |
| **OpenAPI/Swagger** | Auto-generated API docs at `/docs` |


## Environment & Configuration

Environment variables store configuration outside code (in `.env` files). Ignis uses `APP_ENV_` prefix to avoid system conflicts.

```bash
# .env file
APP_ENV_POSTGRES_HOST=localhost
APP_ENV_POSTGRES_PASSWORD=secret123
APP_ENV_SERVER_PORT=3000
```

```typescript
const host = process.env.APP_ENV_POSTGRES_HOST;
```

**Related:** [Environment Variables Reference](../references/configuration/environment-variables.md)


## See Also

[5-Minute Quickstart](./5-minute-quickstart.md) | [Building a CRUD API](./building-a-crud-api.md) | [Repositories](../references/base/repositories/)
