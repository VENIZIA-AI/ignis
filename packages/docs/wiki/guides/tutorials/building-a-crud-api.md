# Building a CRUD API: A Step-by-Step Tutorial

Build a complete, database-backed REST API for managing todos. This guide covers Models, DataSources, Repositories, and Controllers - the core building blocks of Ignis applications.

## Prerequisites

- ✅ Completed [Complete Installation](./complete-installation)
- ✅ PostgreSQL installed and running
- ✅ Database created (see [Prerequisites](./setup))

## What You'll Build

**Components:**
- `Todo` Model - Data structure definition
- `PostgresDataSource` - Database connection
- `TodoRepository` - Data access layer
- `TodoController` - REST API endpoints

**Endpoints:**
- `POST /todos` - Create todo
- `GET /todos` - List all todos
- `GET /todos/:id` - Get single todo
- `PATCH /todos/:id` - Update todo
- `DELETE /todos/:id` - Delete todo

### Architecture Flow

Here's how a request flows through your application:

```
HTTP Request (GET /api/todos/:id)
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
| **Repository** | Abstracts database operations (swap PostgreSQL for MySQL without changing controller) |
| **DataSource** | Manages connection to database |
| **Model** | Defines what the data looks like |

**Benefits of this separation:**
- **Testable** — Mock repository in tests
- **Maintainable** — Clear responsibility for each layer
- **Flexible** — Change database without touching business logic

## Step 1: Install Database Dependencies

```bash
# Add database packages
bun add drizzle-orm drizzle-zod pg lodash

# Add dev dependencies for migrations
bun add -d drizzle-kit @types/pg @types/lodash
```

## Step 2: Define the Model

Models combine Drizzle ORM schemas with Entity classes to define your data structure.

Create `src/models/todo.model.ts`:

```typescript
// src/models/todo.model.ts
import {
  BaseEntity,
  createRelations,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
  TTableObject,
} from '@venizia/ignis';
import { boolean, pgTable, text } from 'drizzle-orm/pg-core';

// 1. Define the Drizzle schema for the 'Todo' table
// Note: Use string literal 'Todo' to avoid circular reference
export const todoTable = pgTable('Todo', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  title: text('title').notNull(),
  description: text('description'),
  isCompleted: boolean('is_completed').default(false),
});

// 2. Define relations (empty for now, but required)
export const todoRelations = createRelations({
  source: todoTable,
  relations: [],
});

// 3. Define the TypeScript type for a Todo object
export type TTodoSchema = typeof todoTable;
export type TTodo = TTableObject<TTodoSchema>;

// 4. Create the Entity class, decorated with @model
@model({ type: 'entity' })
export class Todo extends BaseEntity<typeof Todo.schema> {
  static override schema = todoTable;
  static override relations = () => todoRelations.definitions;
  static override TABLE_NAME = 'Todo';
}
```

**Schema Enrichers:**
- `generateIdColumnDefs()` - Adds `id` column (text with UUID default, or auto-incrementing number)
- `generateTzColumnDefs()` - Adds `createdAt` and `modifiedAt` timestamps

> **Deep Dive:** See [Models & Enrichers Reference](/references/base/models#schema-enrichers) for all available enrichers and options.

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

Ignis uses `APP_ENV_` prefix to prevent conflicts with system variables.

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
- `todo_db` - The database you created in [Prerequisites](./setup#database-setup)

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
  TNodePostgresConnector,
  ValueOrPromise,
} from '@venizia/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

interface IDSConfigs {
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
 * 2. When configure() is called, getSchema() auto-discovers all bound models
 * 3. Drizzle is initialized with the auto-discovered schema
 */
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      // Driver is read from @datasource decorator - no need to pass here!
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
    // getSchema() auto-discovers models from @repository bindings
    const schema = this.getSchema();

    // Log discovered schema for debugging
    const schemaKeys = Object.keys(schema);
    this.logger.debug(
      '[configure] Auto-discovered schema | Schema + Relations (%s): %o',
      schemaKeys.length,
      schemaKeys,
    );

    const client = new Pool(this.settings);
    this.connector = drizzle({ client, schema });
  }
}
```

**Key Points:**
- Schema is auto-discovered from `@repository` decorators - no manual registration needed
- Uses `getSchema()` for lazy schema resolution (resolves when all models are loaded)
- Uses environment variables for connection config
- Implements connection lifecycle methods (`connect()`, `disconnect()`)

> **Deep Dive:** See [DataSources Reference](/references/base/datasources) for advanced configuration and multiple database support.

## Step 4: Create the Repository

Repositories provide type-safe CRUD operations using `DefaultCRUDRepository`.

Create `src/repositories/todo.repository.ts`:

```typescript
// src/repositories/todo.repository.ts
import { Todo } from '@/models/todo.model';
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

// Both 'model' and 'dataSource' are required for schema auto-discovery
@repository({ model: Todo, dataSource: PostgresDataSource })
export class TodoRepository extends DefaultCRUDRepository<typeof Todo.schema> {
  // No constructor needed! DataSource and relations are auto-resolved
  // from the @repository decorator and entity's static properties
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

> **Deep Dive:** See [Repositories Reference](/references/base/repositories) for query options and advanced filtering.

## Step 5: Create the Controller

`ControllerFactory` generates a full CRUD controller with automatic validation and OpenAPI docs.

Create `src/controllers/todo.controller.ts`:

```typescript
// src/controllers/todo.controller.ts
import { Todo } from '@/models/todo.model';
import { TodoRepository } from '@/repositories/todo.repository';
import {
  BindingKeys,
  BindingNamespaces,
  controller,
  ControllerFactory,
  inject,
} from '@venizia/ignis';

const BASE_PATH = '/todos';

// 1. The factory generates a controller class with all CRUD routes
const _Controller = ControllerFactory.defineCrudController({
  repository: { name: TodoRepository.name },
  controller: {
    name: 'TodoController',
    basePath: BASE_PATH,
  },
  entity: () => Todo, // The entity is used to generate OpenAPI schemas
});

// 2. Extend the generated controller to inject the repository
@controller({ path: BASE_PATH })
export class TodoController extends _Controller {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: TodoRepository.name,
      }),
    })
    repository: TodoRepository,
  ) {
    super(repository);
  }
}
```

**Auto-generated Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/todos` | List all todos (find) |
| GET | `/todos/:id` | Get todo by ID (findById) |
| GET | `/todos/find-one` | Find one todo by filter (findOne) |
| GET | `/todos/count` | Count todos (count) |
| POST | `/todos` | Create todo (create) |
| PATCH | `/todos/:id` | Update todo by ID (updateById) |
| PATCH | `/todos` | Update multiple todos by filter (updateBy) |
| DELETE | `/todos/:id` | Delete todo by ID (deleteById) |
| DELETE | `/todos` | Delete multiple todos by filter (deleteBy) |

> **Deep Dive:** See [ControllerFactory Reference](/references/base/controllers#controllerfactory) for customization options.

## Step 6: Register Components

Update `src/application.ts` to register all components:

```typescript
// src/application.ts
import { BaseApplication, IApplicationConfigs, IApplicationInfo, SwaggerComponent, ValueOrPromise } from '@venizia/ignis';
import { HelloController } from './controllers/hello.controller';
import packageJson from '../package.json';

// Import our new components
import { PostgresDataSource } from './datasources/postgres.datasource';
import { TodoRepository } from './repositories/todo.repository';
import { TodoController } from './controllers/todo.controller';

export const appConfigs: IApplicationConfigs = {
  host: process.env.HOST ?? '0.0.0.0',
  port: +(process.env.PORT ?? 3000),
  path: { base: '/api', isStrict: true },
};

export class Application extends BaseApplication {
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return packageJson;
  }

  staticConfigure(): void {}

  setupMiddlewares(): ValueOrPromise<void> {}

  preConfigure(): ValueOrPromise<void> {
    // 1. Register SwaggerComponent for API docs
    this.component(SwaggerComponent);

    // 2. Register datasource
    this.dataSource(PostgresDataSource);

    // 3. Register repository
    this.repository(TodoRepository);

    // 4. Register controllers
    this.controller(HelloController);
    this.controller(TodoController);
  }

  postConfigure(): ValueOrPromise<void> {}
}
```

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
  "created_at" TIMESTAMP DEFAULT NOW(),
  "modified_at" TIMESTAMP DEFAULT NOW()
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
  "migrate:dev": "NODE_ENV=development drizzle-kit migrate --config=src/migration.ts",
  "generate-migration:dev": "NODE_ENV=development drizzle-kit generate --config=src/migration.ts"
}
```

### Run the Migration

```bash
bun run migrate:dev
```

**What happens when you run this:**

1. **Reads** `src/models/todo.model.ts` to see what your schema looks like
2. **Generates SQL** to create the `Todo` table
3. **Connects** to your PostgreSQL database
4. **Executes** the SQL to create the table
5. **Saves** migration files to `./migration/` folder (for version control)

**Expected output:**
```
Reading schema...
Generating migration...
Executing migration...
✓ Done!
```

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
  -d '{"title":"Learn Ignis","description":"Complete tutorial"}'

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
Open [http://localhost:3000/doc/explorer](http://localhost:3000/doc/explorer) to see interactive Swagger UI.

🎉 **Congratulations!** You've built a complete CRUD API with:
- ✅ Type-safe database operations
- ✅ Automatic request validation
- ✅ Auto-generated OpenAPI documentation
- ✅ Clean, maintainable architecture

## What Could Go Wrong? Common Errors

### Error: "Binding 'datasources.PostgresDataSource' not found"

**Cause:** Forgot to register DataSource in `application.ts`

**Fix:**
```typescript
// In application.ts preConfigure():
this.dataSource(PostgresDataSource);  // ← Make sure this is here!
```

**Order matters:** DataSource must be registered before Repository.


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
bun run migrate:dev
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
// In application.ts preConfigure():
this.controller(TodoController);  // ← Make sure this is here!

// Check appConfigs:
path: { base: '/api', isStrict: true },  // All routes start with /api
```

**Debug:** Set `debug.showRoutes: true` in appConfigs to see all registered routes on startup.


### Error: "Invalid JSON" when creating todo

**Cause:** Missing `Content-Type: application/json` header

**Fix:**
```bash
# Make sure you include the header:
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \  # ← This line!
  -d '{"title":"Learn Ignis"}'
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
| 3 | Create `src/controllers/user.controller.ts` |
| 4 | Register repository and controller in `application.ts` |
| 5 | Run migration: `bun run migrate:dev` |
| 6 | Test with curl |

**Hint:** Follow the exact same pattern as `Todo`. The only changes are the model name and fields!

**Solution:** If you get stuck, check the [API Usage Examples](/best-practices/api-usage-examples.md) guide.


## Next Steps

### Adding Business Logic with Services

For complex validation or business rules, create a Service layer:

```typescript
// src/services/todo.service.ts
import { BaseService, inject, getError } from '@venizia/ignis';
import { TodoRepository } from '@/repositories/todo.repository';

export class TodoService extends BaseService {
  constructor(
    @inject({ key: 'repositories.TodoRepository' })
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

Register in `application.ts`:
```typescript
this.service(TodoService);
```

> **Deep Dive:** See [Services Reference](./core-concepts/services) for best practices and advanced patterns.

## Continue Your Journey

You now have a fully functional CRUD API! Here's what to explore next:

**Core Concepts:**
1. [Application Architecture](./core-concepts/application) - Understand the framework structure
2. [Dependency Injection](./core-concepts/dependency-injection) - Master DI patterns
3. [Components](./core-concepts/components) - Build reusable modules

**Add Features:**
1. [Authentication](/references/components/authentication) - Add JWT authentication
2. [Custom Routes](/best-practices/api-usage-examples.md) - Beyond CRUD operations
3. [Relationships](./core-concepts/persistent#querying-with-relations) - Link todos to users

**Production:**
1. [Deployment Strategies](/best-practices/deployment-strategies.md) - Deploy your API
2. [Performance Optimization](/best-practices/performance-optimization.md) - Make it faster
3. [Security Guidelines](/best-practices/security-guidelines.md) - Secure your API
