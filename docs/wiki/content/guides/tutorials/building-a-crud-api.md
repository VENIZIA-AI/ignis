# Building a CRUD API: A Step-by-Step Tutorial

Build a complete, database-backed REST API for managing todos. This guide covers Models, DataSources, Repositories, and Controllers - the core building blocks of IGNIS applications.

**Time to Complete:** ~45 minutes

## Prerequisites

- Completed [Complete Installation](./complete-installation.md)
- PostgreSQL installed and running
- Database created (see [Prerequisites](../get-started/setup.md))

## What You'll Build

**Components:**
- `Todo` Model - Data structure definition
- `PostgresDataSource` - Database connection
- `TodoRepository` - Data access layer
- `TodoController` - REST API endpoints

**Endpoints:**
- `POST /todos` - Create todo
- `GET /todos` - List all todos
- `GET /todos/{id}` - Get single todo
- `PATCH /todos/{id}` - Update todo
- `DELETE /todos/{id}` - Delete todo

### Architecture Flow

Here's how a request flows through your application:

```
HTTP Request (GET /api/todos/{id})
            │
            ▼
   ┌─────────────────┐
   │ TodoController  │  ← Handles HTTP, validates input
   └────────┬────────┘
            │ calls repository.findById()
            ▼
   ┌─────────────────┐
   │ TodoRepository  │  ← Type-safe data access
   └────────┬────────┘
            │ uses dataSource.connector
            ▼
   ┌─────────────────┐
   │PostgresDataSource│ ← Database connection (Drizzle ORM)
   └────────┬────────┘
            │ executes SQL query
            ▼
   ┌─────────────────┐
   │   PostgreSQL    │  ← Actual database
   └────────┬────────┘
            │ returns data
            ▼
      JSON Response
```

**Key Points:**

| Layer | Responsibility |
|-------|----------------|
| **Controller** | Entry point for HTTP requests |
| **Repository** | Abstracts database operations (swap one engine for another, such as PostgreSQL, PGlite or SQLite, by changing the datasource, not the controller) |
| **DataSource** | Manages connection to database |
| **Model** | Defines what the data looks like |

**Benefits of this separation:**
- **Testable** - Mock repository in tests
- **Maintainable** - Clear responsibility for each layer
- **Flexible** - Change database without touching business logic

## Step 1: Install Database Dependencies

```bash
# Add database packages
bun add drizzle-orm drizzle-zod pg

# Add dev dependencies for migrations
bun add -d drizzle-kit @types/pg
```

## Step 2: Define the Model

Models define your data structure with a Drizzle table. You declare the table, then build the model class from it with `ModelFactory.defineEntity`.

Create `src/models/todo.model.ts`:

```typescript
// src/models/todo.model.ts
import { model } from '@venizia/ignis';
import {
  generateIdColumnDefs,
  generateTzColumnDefs,
  ModelFactory,
} from '@venizia/ignis/postgres';
import type { TEntityObject } from '@venizia/ignis/postgres';
import { boolean, pgTable, text } from 'drizzle-orm/pg-core';

// 1. Define the Drizzle table for 'Todo'
export const todoTable = pgTable('Todo', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  title: text('title').notNull(),
  description: text('description'),
  isCompleted: boolean('is_completed').default(false),
});

// 2. Build the model class from the table, decorated with @model
@model()
export class Todo extends ModelFactory.defineEntity({ table: todoTable }) {}

// 3. The row type for a Todo
export type TTodo = TEntityObject<typeof Todo>;
```

**Key points:**
- The table is a plain, exported Drizzle table - drizzle-kit reads it for migrations
- The table name `'Todo'` is written once; the model reads it off the table
- The model has no relations yet, so `defineEntity` needs only `table`
- `TEntityObject<typeof Todo>` is the row type

**Schema Enrichers:**
- `generateIdColumnDefs()` - Adds the `id` column: text filled by a UUID v7 the application generates, an identity integer, or a big-number identity
- `generateTzColumnDefs()` - Adds `createdAt` and `modifiedAt` timestamps

> **Deep Dive:** See [Models & Enrichers Reference](/references/base/models-reference#schema-enrichers) for all available enrichers and options.

## Step 3: Configure Database Connection

### Understanding Environment Variables

Environment variables store configuration outside code (in `.env` files). Benefits: security (no passwords in Git), flexibility (different values per environment).

```typescript
// ❌ BAD: Hardcoded values
const password = "secret123";  // In Git history forever!

// ✅ GOOD: Environment variable with APP_ENV_ prefix
const password = process.env.APP_ENV_DB_PASSWORD;
// or
const password = Bun.env.APP_ENV_DB_PASSWORD;
```

IGNIS uses `APP_ENV_` prefix to prevent conflicts with system variables.

### Create `.env` File

Create `.env` in your project root with your database credentials:

```bash
# .env
APP_ENV_POSTGRES_HOST=localhost
APP_ENV_POSTGRES_PORT=5432
APP_ENV_POSTGRES_USERNAME=postgres
APP_ENV_POSTGRES_PASSWORD=your_password_here
APP_ENV_POSTGRES_DATABASE=todo_db
```

**Replace these values:**
- `your_password_here` - Your PostgreSQL password (or leave blank if no password)
- `todo_db` - The database you created in [Prerequisites](../get-started/setup.md#step-2-install-postgresql-for-the-crud-tutorial)

**Important:** Add `.env` to your `.gitignore`:
```bash
echo ".env" >> .gitignore
```

This prevents accidentally committing secrets to Git.

Create `src/datasources/postgres.datasource.ts`:

```typescript
// src/datasources/postgres.datasource.ts
import {
  BaseDataSource,
  datasource,
  ValueOrPromise,
} from '@venizia/ignis';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { Pool } from 'pg';

interface IDataSourceConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * PostgresDataSource with auto-discovery support.
 *
 * How it works:
 * 1. @repository decorator binds model to datasource
 * 2. getSchema() auto-discovers all bound models when the driver/connector are wired
 * 3. Naming NodePostgresDriver in @datasource is what wires the driver and Drizzle connector
 */
@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BaseDataSource<IDataSourceConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: process.env.APP_ENV_POSTGRES_HOST ?? 'localhost',
        port: +(process.env.APP_ENV_POSTGRES_PORT ?? 5432),
        database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'todo_db',
        user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
        password: process.env.APP_ENV_POSTGRES_PASSWORD ?? '',
      },
      // NO schema property - auto-discovered from @repository bindings!
    });
  }

  override configure(): ValueOrPromise<void> {
    // getSchema() auto-discovers models from @repository bindings; log it for debugging
    const schemaKeys = Object.keys(this.getSchema());
    this.logger.debug(
      '[configure] Auto-discovered schema | Schema + Relations (%s): %o',
      schemaKeys.length,
      schemaKeys,
    );

    // The client must land on this.client - a local would leave beginTransaction() with nothing
    // to resolve a driver from, and it would throw `No driver and no client`. NodePostgresDriver
    // named in @datasource above is what wires the driver and Drizzle connector from it.
    this.client = new Pool(this.settings);
  }

  // Abstract on the Postgres tier - no framework code can guess a postgresql:// URL,
  // so every Postgres datasource implements it.
  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

**Key Points:**
- Schema is auto-discovered from `@repository` decorators - no manual registration needed
- Uses `getSchema()` for lazy schema resolution (resolves when all models are loaded)
- Uses environment variables for connection config
- `configure()` only assigns `this.client` - the base class wires the driver and connector from `@datasource({ driver })`
- `getConnectionString()` is abstract on the Postgres tier, so you must implement it

> **Deep Dive:** See [DataSources Reference](/references/base/datasources) for advanced configuration and multiple database support.

## Step 4: Create the Repository

:::info What are Generic Types?
Generic types in TypeScript are like placeholders that let you write reusable code that works with different types. The `<T>` syntax means "this class/function works with type T, which you'll specify later."

Example: `DefaultCRUDRepository<typeof todoTable>` means "a repository that works specifically with the Todo table type." This gives you type safety and autocomplete for your model's properties.

[Learn more →](/guides/reference/glossary#generic-types)
:::

Repositories provide type-safe CRUD operations using `DefaultCRUDRepository`.

Create `src/repositories/todo.repository.ts`:

```typescript
// src/repositories/todo.repository.ts
import { Todo, type todoTable } from '@/models/todo.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';

// Both 'model' and 'dataSource' are required for schema auto-discovery
@repository({ model: Todo, dataSource: PostgresDataSource })
export class TodoRepository extends DefaultCRUDRepository<typeof todoTable> {
  // No constructor needed! DataSource and relations are auto-resolved
  // from the @repository decorator and the model's static properties
}
```

**Available Methods:**

| Method | Description |
|--------|-------------|
| `create()` | Insert new record(s) |
| `find()` | Query multiple records with filters |
| `findOne()` | Get single record by filter |
| `findById()` | Get record by ID |
| `updateById()` | Update record by ID |
| `updateAll()` | Update multiple records |
| `deleteById()` | Delete record by ID |
| `deleteAll()` | Delete multiple records |
| `count()` | Count matching records |

Reads return their result directly: `find()` returns an array of rows, `findOne()` and `findById()` return a row or `null`. The `{ count, data }` shape is what the generated HTTP routes answer (and what write methods such as `create()` return), not what `find()` returns.

> **Deep Dive:** See [Repositories Reference](/references/base/repositories/) for query options and advanced filtering.

## Step 5: Create the Controller

:::info What is Dependency Injection?
Dependency Injection (DI) is a design pattern where objects receive their dependencies from outside rather than creating them internally. Instead of `new Repository()` inside a controller, you declare "I need a Repository" using `@inject`, and the framework provides it automatically.

**Benefits:**
- **Testable** - Replace real services with mocks in tests
- **Flexible** - Swap implementations without changing code
- **Maintainable** - Dependencies are explicit and centralized

[Learn more →](/guides/core-concepts/dependency-injection)
:::

`ControllerFactory` generates a full CRUD controller with automatic validation and OpenAPI docs.

Create `src/controllers/todo/definitions.ts`:

```typescript
// src/controllers/todo/definitions.ts
import { Todo } from '@/models/todo.model';
import { TodoRepository } from '@/repositories/todo.repository';
import { ControllerFactory } from '@venizia/ignis';

export const BASE_PATH = '/todos';

// The factory generates a controller class with all CRUD routes
export const _Controller = ControllerFactory.defineCrudController({
  repository: { name: TodoRepository.name },
  controller: {
    name: 'TodoController',
    basePath: BASE_PATH,
  },
  entity: () => Todo, // The entity is used to generate OpenAPI schemas
});
```

Create `src/controllers/todo/todo.controller.ts`:

```typescript
// src/controllers/todo/todo.controller.ts
import { controller } from '@venizia/ignis';
import { BASE_PATH, _Controller } from './definitions';

// No constructor: the container injects the repository named in repository.name
@controller({ path: BASE_PATH })
export class TodoController extends _Controller {}
```

Create `src/controllers/todo/index.ts`:

```typescript
export * from './todo.controller';
```

**Auto-generated Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/todos` | List all todos (find) |
| GET | `/todos/{id}` | Get todo by ID (findById) |
| GET | `/todos/find-one` | Find one todo by filter (findOne) |
| GET | `/todos/count` | Count todos (count) |
| POST | `/todos` | Create todo (create) |
| PATCH | `/todos/{id}` | Update todo by ID (updateById) |
| PATCH | `/todos` | Update multiple todos by filter (updateBy) |
| DELETE | `/todos/{id}` | Delete todo by ID (deleteById) |
| DELETE | `/todos` | Delete multiple todos by filter (deleteBy) |

> **Deep Dive:** See [ControllerFactory Reference](/references/base/controllers#controllerfactory) for customization options.

## Step 6: Register Components

There is nothing to write. `@datasource`, `@repository` and `@controller` already mark the three classes, and the `artifacts: AutoArtifacts` line in `src/application.ts` (from [Complete Installation](./complete-installation.md)) scans `src` at start-up and registers every marked class. `application.ts` stays as it was:

```typescript
// src/application.ts
export const appConfigs: IApplicationConfigs = {
  host: process.env.HOST ?? '0.0.0.0',
  port: +(process.env.PORT ?? 3000),
  path: { base: '/api', isStrict: true },
  artifacts: AutoArtifacts, // finds PostgresDataSource, TodoRepository, TodoController, HelloController
};
```

> [!NOTE] Registration Order
> Registration order does not matter. Each registration only creates a binding; nothing is resolved yet. The boot sequence then configures datasources, then components, then controllers, so a repository always finds its datasource.

## Step 7: Run Database Migration

### Understanding Database Migrations

Your code defines a `Todo` table, but PostgreSQL doesn't have it yet. A migration creates/modifies database tables - like "Git commits for your schema."

```sql
-- Drizzle generates and runs this for you:
CREATE TABLE "Todo" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "is_completed" BOOLEAN DEFAULT false,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "modified_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

Benefits: team sync, version control, rollback capability.

### Create Migration Config

Create `src/migration.ts`:

```typescript
// src/migration.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/models/todo.model.ts',  // Where your model definitions are
  out: './migration',                     // Where to save generated SQL files
  dialect: 'postgresql',                  // Database type
  dbCredentials: {
    // Use the same .env values as your datasource
    host: process.env.APP_ENV_POSTGRES_HOST!,
    port: +(process.env.APP_ENV_POSTGRES_PORT ?? 5432),
    user: process.env.APP_ENV_POSTGRES_USERNAME,
    password: process.env.APP_ENV_POSTGRES_PASSWORD,
    database: process.env.APP_ENV_POSTGRES_DATABASE!,
  },
});
```

### Add Migration Scripts

Add these scripts to your `package.json`:

```json
"scripts": {
  "db:push": "NODE_ENV=development drizzle-kit push --config=src/migration.ts",
  "db:generate": "NODE_ENV=development drizzle-kit generate --config=src/migration.ts",
  "db:migrate": "NODE_ENV=development drizzle-kit migrate --config=src/migration.ts"
}
```

### Run the Migration

For development, use `push` - it reads your schema and applies changes directly to the database:

```bash
bun run db:push
```

**What happens when you run this:**

1. **Reads** `src/models/todo.model.ts` to see what your schema looks like
2. **Compares** it against the current database state
3. **Generates and executes** the SQL to create/update tables

> **Production workflow:** Use `db:generate` to create versioned migration files, then `db:migrate` to apply them. This gives you version control and rollback capability. `push` is simpler but skips the migration file step.

**Verify it worked:**
```bash
psql -U postgres -d todo_db -c "\d Todo"
```

You should see the `Todo` table structure with all your columns!

## Step 8: Run and Test

Start your application:

```bash
bun run server:dev
```

Test the API endpoints:

```bash
# Create a todo
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Learn IGNIS","description":"Complete tutorial"}'

# Get all todos
curl http://localhost:3000/api/todos

# Get todo by ID (replace {id} with actual ID from create response)
curl http://localhost:3000/api/todos/{id}

# Update todo
curl -X PATCH http://localhost:3000/api/todos/{id} \
  -H "Content-Type: application/json" \
  -d '{"isCompleted":true}'

# Delete todo
curl -X DELETE http://localhost:3000/api/todos/{id}
```

**View API Documentation:**
Open `http://localhost:3000/api/doc/explorer` to see an interactive Scalar API reference. The explorer registers at `/doc/explorer` on the root router, which mounts under `path.base`.

**Congratulations!** You've built a complete CRUD API with:
- Type-safe database operations
- Automatic request validation
- Auto-generated OpenAPI documentation
- Clean, maintainable architecture

## What Could Go Wrong? Common Errors

### Error: "Binding key: datasources.PostgresDataSource is not bounded in context!"

**Cause:** The class is not registered. Either `@datasource` is missing, the file is outside `src`, or `artifacts: AutoArtifacts` is missing from `appConfigs`.

**Fix:**
```typescript
@datasource({ driver: NodePostgresDriver })  // ← Make sure this is here!
export class PostgresDataSource extends BaseDataSource<IDataSourceConfigs> {}
```


### Error: "connection refused" or "ECONNREFUSED"

**Cause:** PostgreSQL isn't running, or wrong connection details in `.env`

**Fix:**
```bash
# Check if PostgreSQL is running:
psql -U postgres -c "SELECT 1;"

# If not running, start it:
brew services start postgresql@14  # macOS
sudo service postgresql start      # Linux
```

**Verify `.env` values match your PostgreSQL setup.**


### Error: "relation 'Todo' does not exist"

**Cause:** Forgot to run database migration

**Fix:**
```bash
bun run db:push
```

**Verify the table exists:**
```bash
psql -U postgres -d todo_db -c "\dt"
```

You should see `Todo` in the list.


### Error: 404 Not Found on `/api/todos`

**Cause:** Controller not registered or wrong path configuration

**Fix:**
```typescript
// On the class:
@controller({ path: BASE_PATH })  // ← Make sure this is here!
export class TodoController extends _Controller {}

// Check appConfigs:
path: { base: '/api', isStrict: true },  // All routes start with /api
```

**Debug:** Set `debug: { shouldShowRoutes: true }` in appConfigs to see all registered routes on startup.


### Error: "Invalid JSON" when creating todo

**Cause:** Missing `Content-Type: application/json` header

**Fix:**
```bash
# Make sure you include the header:
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \  # ← This line!
  -d '{"title":"Learn IGNIS"}'
```


## Test Your Understanding: Build a Second Feature

Now that you've built the Todo API, try building a **User** feature on your own!

**Requirements:**
- Create `/api/users` endpoint
- Users should have: `id`, `email`, `name`, `createdAt`, `modifiedAt`
- Use `ControllerFactory` for CRUD operations

**Challenge checklist:**

| Step | Task |
|:----:|------|
| 1 | Create `src/models/user.model.ts` |
| 2 | Create `src/repositories/user.repository.ts` (auto-registers User with PostgresDataSource) |
| 3 | Create `src/controllers/user/` (definitions.ts, user.controller.ts, index.ts) |
| 4 | Decorate the repository (`@repository`) and the controller (`@controller`) - `AutoArtifacts` registers them |
| 5 | Push schema: `bun run db:push` |
| 6 | Test with curl |

**Hint:** Follow the exact same pattern as `Todo`. The only changes are the model name and fields!

**Solution:** If you get stuck, check the [API Usage Examples](/best-practices/api-usage-examples.md) guide.


## Next Steps

### Adding Business Logic with Services

For complex validation or business rules, create a Service layer:

```typescript
// src/services/todo.service.ts
import { BaseService, inject, service } from '@venizia/ignis';
import { getError } from '@venizia/ignis-helpers';
import { TodoRepository } from '@/repositories/todo.repository';

@service()
export class TodoService extends BaseService {
  constructor(
    @inject({ target: TodoRepository })
    private todoRepository: TodoRepository,
  ) {
    super({ scope: TodoService.name });
  }

  async createTodo(data: any) {
    // Business logic validation
    if (data.title.length < 3) {
      throw getError({ message: 'Title too short' });
    }

    // Check for duplicates
    const existing = await this.todoRepository.findOne({
      filter: { where: { title: data.title } },
    });
    if (existing) {
      throw getError({ message: 'Todo already exists' });
    }

    return this.todoRepository.create({ data });
  }
}
```

`@service()` marks the class and `AutoArtifacts` registers it - no line in `application.ts`.

> **Deep Dive:** See [Services Reference](../core-concepts/services.md) for best practices and advanced patterns.

## Continue Your Journey

You now have a fully functional CRUD API! Here's what to explore next:

**Core Concepts:**
1. [Application Architecture](../core-concepts/application/) - Understand the framework structure
2. [Dependency Injection](../core-concepts/dependency-injection.md) - Master DI patterns
3. [Components](../core-concepts/components.md) - Build reusable modules

**Add Features:**
1. [Authentication](/extensions/components/authentication/) - Add JWT authentication
2. [Custom Routes](/best-practices/api-usage-examples.md) - Beyond CRUD operations
3. [Relationships](../core-concepts/persistent/) - Link todos to users

**Production:**
1. [Deployment Strategies](/best-practices/deployment-strategies.md) - Deploy your API
2. [Performance Optimization](/best-practices/performance-optimization.md) - Make it faster
3. [Security Guidelines](/best-practices/security-guidelines.md) - Secure your API
