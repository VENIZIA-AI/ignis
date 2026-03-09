# GEMINI Project Context: Ignis Framework

## 1. Project Overview
**Ignis** is a high-performance, enterprise-grade Server Infrastructure framework for TypeScript, built on top of **Hono**. It is designed to bridge the gap between minimalist web frameworks and structured enterprise solutions (like LoopBack 4 or NestJS).

*   **Goal**: Provide a standardized, opinionated architecture for building scalable backend systems using modern tools (Bun, Drizzle, Hono).
*   **Philosophy**: "Enterprise patterns (IOC, Repositories) meet performance (Hono/Bun)."

## 2. Technical Stack

### Core Technologies
*   **Runtime**: [Bun](https://bun.sh) (Primary/Recommended) v1.3+, Node.js (Supported) v18+.
*   **Language**: TypeScript v5.x (Strict Mode).
*   **Web Framework**: [Hono](https://hono.dev) v4.x.
*   **ORM**: [Drizzle ORM](https://orm.drizzle.team) (PostgreSQL via `node-postgres`).
*   **Database**: PostgreSQL v14+.
*   **Validation**: [Zod](https://zod.dev) (Schema validation & OpenAPI generation).
*   **Documentation**: OpenAPI 3.0 (via `@hono/zod-openapi`), Scalar UI, Swagger UI.

### Architecture & Patterns
*   **Monorepo**: Managed via Bun Workspaces.
*   **Dependency Injection**: Custom IOC container using `reflect-metadata`.
*   **Repository Pattern**: Strict Layered Architecture (Controller -> Service -> Repository -> DataSource).
*   **Mixins**: Used for composable logic in Repositories (`DefaultFilterMixin`, `FieldsVisibilityMixin`).

## 3. Project Structure
The project is organized as a Monorepo:

### `packages/` (Core Framework)
*   **`core`** (`@venizia/ignis`): The main framework entry point. Exports base classes (`BaseApplication`, `BaseController`, `DefaultCRUDRepository`) and core logic.
*   **`boot`** (`@venizia/ignis-boot`): Handles application bootstrapping, artifact auto-discovery, and loading strategies.
*   **`inversion`** (`@venizia/ignis-inversion`): The Dependency Injection (IOC) container implementation.
*   **`helpers`** (`@venizia/ignis-helpers`): Shared utility functions and types.
*   **`dev-configs`** (`@venizia/dev-configs`): Shared configuration for ESLint, Prettier, and TypeScript.
*   **`docs`**: Documentation site and MCP server.

### `examples/` (Reference Implementations)
*   **`vert`**: A complete, production-ready backend implementation featuring:
    *   Advanced PostgreSQL integration with Drizzle ORM.
    *   JWT-based Authentication and Authorization.
    *   Comprehensive Swagger/OpenAPI 3.0 documentation.
    *   Full CRUD repositories and modular services.
    *   Integrated logging and environment-flow configuration.

## 4. Key Architectural Features

### 4.1 Dependency Injection (IOC)
Ignis uses a decorator-based DI system similar to LoopBack 4:
*   **Decorators**: `@inject`, `@service`, `@controller`, `@repository`, `@datasource`.
*   **Binding**: Keys are structured (e.g., `datasources.PostgresDataSource`).
*   **Scopes**: Supports Singleton, Transient, and Request scopes.

### 4.2 Repository Pattern & Transactions
The framework implements a robust Repository pattern with built-in transaction support:
*   **Hierarchy**: `AbstractRepository` -> `ReadableRepository` -> `PersistableRepository` -> `DefaultCRUDRepository`.
*   **Transaction Mechanism**:
    *   Transactions are managed via `resolveConnector({ transaction })`.
    *   **Logic**: The `DataSource` creates a *new* ephemeral Drizzle instance (`drizzle({ client, schema })`) bound to a specific `PoolClient` but sharing the global schema.
    *   **Usage**: Repositories can seamlessly switch between the global pool and a transaction client without code changes in the business logic.

### 4.3 DataSources & Auto-Discovery
*   **Wrapper**: DataSources wrap Drizzle ORM instances.
*   **Schema Discovery**: The framework automatically scans registered repositories to build the Drizzle schema object at runtime, allowing for "Code-First" schema definition via Models.

### 4.4 Controllers
*   **Declarative Routing**: `@get`, `@post`, `@put`, `@delete` decorators define routes.
*   **Zod Integration**: Request bodies and Response shapes are defined using Zod, which automatically generates OpenAPI specifications.

## 5. Setup & Usage Instructions

### Prerequisites
*   Bun installed (`curl -fsSL https://bun.sh/install | bash`).
*   PostgreSQL running locally or via Docker.

### Installation
1.  **Clone**: `git clone <repo>`
2.  **Install**: Run `bun install` in the root (installs dependencies for all workspaces).

### Development Commands
*   **Build Framework**: `bun run build` (Compiles all packages).
*   **Run Example (Vert)**:
    ```bash
    cd examples/vert
    bun run server:dev
    ```
*   **Linting**: `bun run lint` (ESLint + Prettier).
*   **Clean**: `bun run clean`.

### Working with Database (Example)
1.  Define a Model (`src/models/entities/user.model.ts`).
2.  Create a Repository (`src/repositories/user.repository.ts`) extending `DefaultCRUDRepository`.
3.  Register in Application.
4.  Run Migrations: `bun run migrate:dev` (wraps `drizzle-kit`).

## 6. Detailed Implementation Notes
*   **Raw Queries**: Use `this.resolveConnector({ transaction })` in repositories to get a transaction-safe Drizzle instance.
*   **Query API**: Use `this.getQueryInterface({ options })` for Drizzle's Relational Query API (`db.query...`).
*   **Hidden Fields**: The `FieldsVisibilityMixin` automatically handles stripping sensitive fields (defined in Models) from responses.
