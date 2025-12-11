# @venizia/ignis-docs

[![npm version](https://img.shields.io/npm/v/@venizia/ignis-docs.svg)](https://www.npmjs.com/package/@venizia/ignis-docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Documentation and **MCP (Model Context Protocol) Server** for the **Ignis Framework**. The MCP server allows AI assistants to access Ignis documentation in real-time.

## Installation

```bash
bun add @venizia/ignis-docs
# or
npm install @venizia/ignis-docs
```

## MCP Server Usage

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "bunx",
      "args": ["@venizia/ignis-docs@latest"]
    }
  }
}
```

You can also `npx` for alternative

## Available MCP Tools

| Tool | Description |
|------|-------------|
| **search** | Search documentation by keyword |
| **getDocContent** | Get full content of a document |
| **listDocs** | List all available documents |
| **listCategories** | List documentation categories |
| **getDocMetadata** | Get document metadata |

## About Ignis

Ignis brings together the structured, enterprise development experience of **LoopBack 4** with the blazing speed and simplicity of **Hono** - giving you the best of both worlds.

## Documentation

- [Ignis Repository](https://github.com/venizia-ai/ignis)
- [MCP Server Guide](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/get-started/mcp-docs-server.md)
- [Main Documentation](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/index.md)

## License

MIT

---

## MCP Docs Server | PROMP REQUEST: 

**Question:** With Bun runtime + package management, create a monorepo project, "packages" is root folder of contain another project folder. Inside "packages" have two folder "be" and "fe". Just implement be with best practice ignis framework.

---
## Plan: Create Bun Workspace Monorepo with Production-Ready Ignis Backend

## User Requirements ✅
- **Backend Scope**: Production Starter Kit (CRUD API + Authentication + Components)
- **Components**: Swagger (API Docs), Health Check, Authentication (JWT)
- **Frontend**: Empty placeholder with basic package.json
- **Architecture**: Follow Ignis best practices

---

## Implementation Plan

### 1. Root Monorepo Setup

**Files to create:**
- `package.json` - Root workspace configuration
- `.gitignore` - Ignore node_modules, dist, .env files
- `README.md` - Project documentation

**Root package.json structure:**
```json
{
  "name": "ignis-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "be:dev": "bun --cwd packages/be run server:dev",
    "be:build": "bun --cwd packages/be run build",
    "be:lint": "bun --cwd packages/be run lint"
  }
}
```

---

### 2. Backend Package Structure (`packages/be/`)

**Directory structure:**
```
packages/be/
├── package.json
├── tsconfig.json
├── .prettierrc.mjs
├── .prettierignore
├── eslint.config.mjs
├── .env.example
├── scripts/
│   └── clean.sh
└── src/
    ├── index.ts              # Entry point
    ├── application.ts        # Main application class
    ├── migration.ts          # Drizzle migration config
    ├── controllers/
    │   ├── hello.controller.ts
    │   └── todo.controller.ts
    ├── services/
    │   └── authentication.service.ts
    ├── repositories/
    │   └── todo.repository.ts
    ├── datasources/
    │   └── postgres.datasource.ts
    └── models/
        └── todo.model.ts
```

**Key decisions:**
- PostgreSQL for database (as recommended in Ignis docs)
- Todo CRUD as example implementation
- JWT authentication with custom AuthenticationService
- All three components: Swagger, Health Check, Authentication

---

### 3. Backend Dependencies

**Production dependencies:**
```bash
bun add hono @hono/zod-openapi @scalar/hono-api-reference @venizia/ignis dotenv-flow
bun add drizzle-orm drizzle-zod pg lodash
```

**Development dependencies:**
```bash
bun add -d typescript @types/bun @venizia/dev-configs tsc-alias tsconfig-paths
bun add -d drizzle-kit @types/pg @types/lodash
```

---

### 4. Configuration Files

**tsconfig.json:**
- Extend from `@venizia/dev-configs/tsconfig.common.json`
- Configure path aliases: `@/*` → `src/*`
- Output to `dist/`

**.prettierrc.mjs:**
- Import from `@venizia/dev-configs`

**eslint.config.mjs:**
- Import from `@venizia/dev-configs`

**.env.example:**
```env
# Application
HOST=0.0.0.0
PORT=3000
APP_ENV_APPLICATION_NAME=ignis-backend

# Database
APP_ENV_POSTGRES_HOST=localhost
APP_ENV_POSTGRES_PORT=5432
APP_ENV_POSTGRES_USERNAME=postgres
APP_ENV_POSTGRES_PASSWORD=your_password
APP_ENV_POSTGRES_DATABASE=ignis_db

# Authentication (REQUIRED - Generate strong secrets!)
APP_ENV_APPLICATION_SECRET=your-strong-application-secret-here
APP_ENV_JWT_SECRET=your-strong-jwt-secret-here
APP_ENV_JWT_EXPIRES_IN=86400
```

---

### 5. Core Implementation Files

#### `src/application.ts`
**Features:**
- Register PostgresDataSource
- Register TodoRepository
- Register TodoController, HelloController
- Register AuthenticationService
- Register all 3 components: HealthCheckComponent, SwaggerComponent, AuthenticateComponent
- Register JWTAuthenticationStrategy
- Configure app with base path `/api`

#### `src/models/todo.model.ts`
**Schema:**
- `id` (UUID, auto-generated)
- `title` (text, required)
- `description` (text, optional)
- `isCompleted` (boolean, default false)
- `createdAt`, `modifiedAt` (timestamps, auto-generated)

#### `src/datasources/postgres.datasource.ts`
**Features:**
- Connect to PostgreSQL using environment variables
- Register Todo model schema
- Implement connect/disconnect lifecycle

#### `src/repositories/todo.repository.ts`
**Features:**
- Extend `DefaultCRUDRepository<TTodoSchema>`
- Inject PostgresDataSource

#### `src/controllers/todo.controller.ts`
**Features:**
- Use `ControllerFactory.defineCrudController()` for auto-generated CRUD endpoints
- Base path: `/todos`
- All operations protected by JWT (optional - can be added later)

#### `src/controllers/hello.controller.ts`
**Features:**
- Simple GET `/hello` endpoint
- Returns `{ message: "Hello, World!" }`
- OpenAPI schema with Zod

#### `src/services/authentication.service.ts`
**Features:**
- Implement `IAuthService` interface
- `signIn()` method with hardcoded test credentials (test_username / test_password)
- Generate JWT using JWTTokenService
- TODO comments for production implementation (database lookup, password hashing)

#### `src/migration.ts`
**Features:**
- Drizzle Kit configuration
- Point to todo.model.ts
- Use PostgreSQL dialect
- Connection from environment variables

#### `src/index.ts`
**Features:**
- Import dotenv-flow
- Create Application instance
- Start server

---

### 6. Frontend Package Structure (`packages/fe/`)

**Minimal setup:**
```
packages/fe/
├── package.json
└── README.md
```

**package.json:**
```json
{
  "name": "@ignis-monorepo/fe",
  "version": "1.0.0",
  "private": true,
  "description": "Frontend application - framework to be determined"
}
```

**README.md:**
```markdown
# Frontend Application

This folder is prepared for the frontend application.

## Next Steps
- Choose your framework (React, Vue, Svelte, etc.)
- Run framework setup command
- Configure to work with backend at http://localhost:3000/api
```

---

### 7. Scripts and Utilities

**packages/be/scripts/clean.sh:**
- Remove `dist/`, `*.tsbuildinfo`, `.eslintcache`
- Remove `artifact.zip`

**packages/be/package.json scripts:**
```json
{
  "lint": "bun run eslint && bun run prettier:cli",
  "lint:fix": "bun run eslint --fix && bun run prettier:fix",
  "prettier:cli": "prettier \"**/*.{js,ts}\" -l",
  "prettier:fix": "bun run prettier:cli --write",
  "eslint": "eslint --report-unused-disable-directives .",
  "build": "tsc -p tsconfig.json && tsc-alias -p tsconfig.json",
  "clean": "sh ./scripts/clean.sh",
  "rebuild": "bun run clean && bun run build",
  "migrate:dev": "NODE_ENV=development drizzle-kit push --config=src/migration.ts",
  "generate-migration:dev": "NODE_ENV=development drizzle-kit generate --config=src/migration.ts",
  "preserver:dev": "bun run rebuild",
  "server:dev": "NODE_ENV=development bun .",
  "server:prod": "NODE_ENV=production bun ."
}
```

---

### 8. Post-Setup Instructions

**After implementation, user needs to:**

1. **Create PostgreSQL database:**
   ```bash
   psql -U postgres
   CREATE DATABASE ignis_db;
   \q
   ```

2. **Copy .env.example to .env and configure:**
   ```bash
   cd packages/be
   cp .env.example .env
   # Edit .env with your database credentials and secrets
   ```

3. **Generate strong secrets:**
   ```bash
   # Use these commands to generate secrets:
   openssl rand -base64 32  # For APP_ENV_APPLICATION_SECRET
   openssl rand -base64 32  # For APP_ENV_JWT_SECRET
   ```

4. **Install dependencies:**
   ```bash
   bun install
   ```

5. **Run database migration:**
   ```bash
   bun run be:dev  # This will run migration automatically via preserver:dev
   ```

6. **Test the API:**
   - Health check: `http://localhost:3000/health`
   - API docs: `http://localhost:3000/doc/explorer`
   - Hello endpoint: `http://localhost:3000/api/hello`
   - Sign in: `POST http://localhost:3000/api/auth/sign-in` with `{"identifier": {"value": "test_username"}, "credential": {"value": "test_password"}}`
   - Todos CRUD: `http://localhost:3000/api/todos`

---

### 9. Available Endpoints

After setup, the following endpoints will be available:

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| `GET` | `/health` | Health check | No |
| `POST` | `/health/ping` | Ping-pong test | No |
| `GET` | `/doc/explorer` | Swagger UI (Scalar) | No |
| `GET` | `/doc/openapi.json` | OpenAPI spec | No |
| `GET` | `/api/hello` | Hello world | No |
| `POST` | `/api/auth/sign-in` | JWT login | No |
| `GET` | `/api/todos` | List todos | No* |
| `POST` | `/api/todos` | Create todo | No* |
| `GET` | `/api/todos/:id` | Get todo | No* |
| `PATCH` | `/api/todos/:id` | Update todo | No* |
| `DELETE` | `/api/todos/:id` | Delete todo | No* |

*Note: Todo endpoints can be easily protected with JWT by adding `authStrategies: [Authentication.STRATEGY_JWT]` to route configs*

---

### 10. Critical Files to Create

**Root level:**
1. `package.json` - Workspace config
2. `.gitignore` - Git ignore patterns
3. `README.md` - Project documentation

**packages/be/:**
1. `package.json` - Backend dependencies and scripts
2. `tsconfig.json` - TypeScript configuration
3. `.prettierrc.mjs` - Prettier config
4. `.prettierignore` - Prettier ignore patterns
5. `eslint.config.mjs` - ESLint config
6. `.env.example` - Environment variable template
7. `scripts/clean.sh` - Cleanup script
8. `src/index.ts` - Entry point
9. `src/application.ts` - Main application class
10. `src/migration.ts` - Database migration config
11. `src/models/todo.model.ts` - Todo model
12. `src/datasources/postgres.datasource.ts` - Database connection
13. `src/repositories/todo.repository.ts` - Todo data access
14. `src/controllers/todo.controller.ts` - Todo API endpoints
15. `src/controllers/hello.controller.ts` - Hello endpoint
16. `src/services/authentication.service.ts` - Auth logic

**packages/fe/:**
1. `package.json` - Frontend package placeholder
2. `README.md` - Frontend setup instructions

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     HTTP Requests                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │  Components Layer       │
         │  • HealthCheckComponent │
         │  • SwaggerComponent     │
         │  • AuthenticateComponent│
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  Controllers Layer      │
         │  • HelloController      │
         │  • TodoController       │
         │  • (Auth auto-registered)│
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  Services Layer         │
         │  • AuthenticationService│
         │  • (Business logic)     │
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  Repositories Layer     │
         │  • TodoRepository       │
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  DataSources Layer      │
         │  • PostgresDataSource   │
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │     PostgreSQL DB       │
         └─────────────────────────┘
```

This follows Ignis layered architecture best practices with clear separation of concerns.
