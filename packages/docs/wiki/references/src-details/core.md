# Package: `@venizia/ignis`

Detailed breakdown of the core framework directory structure.

## Quick Reference

**Package:** Core framework with fundamental building blocks, architectural layers, and modular features.

### Top-Level Directories

| Directory | Primary Focus | Key Components |
|-----------|---------------|----------------|
| **`base`** | Core architecture | Applications, Controllers, Repositories, Services, Models |
| **`components`** | Pluggable features | Auth, Swagger, HealthCheck, SocketIO |
| **`helpers`** | Utilities | DI (extended), Re-exports from `@venizia/ignis-helpers` |
| **`common`** | Shared code | Constants, bindings, types, environments |
| **`utilities`** | Pure functions | Crypto, date, parse, performance, schema |
| **`__tests__`** | Tests | Integration and E2E tests |

## Project Structure Overview

Top-level breakdown of the `src` directory:

| Folder           | Purpose                                                                                                                |
| :--------------- | :--------------------------------------------------------------------------------------------------------------------- |
| **`__tests__`**  | Contains integration and end-to-end tests for the framework's features.                                                |
| **`base`**       | The core building blocks and abstract classes of the framework. This is where the fundamental architecture is defined. |
| **`common`**     | A directory for code that is shared and used across the entire framework.                                              |
| **`components`** | A collection of ready-to-use, high-level components that can be plugged into an Ignis application.                     |
| **`helpers`**    | Contains core extensions (like Inversion) and re-exports from `@venizia/ignis-helpers`.                                    |
| **`utilities`**  | A collection of pure, standalone utility functions.                                                                    |

---

## Detailed Sections

### `__tests__`

This directory is dedicated to the framework's test suite.

| File/Folder             | Purpose/Key Details                                                                                                              |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `jwt/`                  | Contains test cases specifically for the JWT authentication functionality, demonstrating how tokens are generated and validated. |
| `jwt/test-cases/jwt.ts` | Example: defines `TestCase001` to check JWT creation.                                                                            |

### `base`

This is the foundational layer of Ignis, defining the core architecture and abstract classes that other parts of the framework extend or implement.

#### `base/applications`

| File/Folder   | Purpose/Key Details                                                                                                                                                                                                                                                                                       |
| :------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `abstract.ts` | Defines `AbstractApplication`, the base class for Ignis applications. Handles core server setup (Hono instance, runtime detection for Bun/Node.js), environment validation, and route inspection. Mandates abstract methods for middleware setup and configuration.                                       |
| `base.ts`     | Extends `AbstractApplication` to provide `BaseApplication`, implementing common functionalities like component, controller, service, repository, and datasource registration. Includes default middleware registration (e.g., error handling, favicon, request tracking) and startup information logging. Integrates with `@venizia/ignis-boot` for automatic artifact discovery when `bootOptions` is configured. |
| `types.ts`    | Contains interfaces for application configurations (`IApplicationConfigs`), application information (`IApplicationInfo`), and various middleware options (e.g., `ICORSOptions`, `ICSRFOptions`). Now includes `IBootableApplication` interface for boot system integration. |

#### `base/components`

| File/Folder | Purpose/Key Details                                                                                                                                       |
| :---------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base.ts`   | Defines `BaseComponent`, the abstract class for all pluggable components. Manages component-specific bindings and a `configure()` method for setup logic. |

#### `base/controllers`

| File/Folder   | Purpose/Key Details                                                                                                                                                                                                                                |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `abstract.ts` | Defines `AbstractController`, an abstract class providing core controller functionalities like `getRouteConfigs` for standardizing route configurations, and `registerRoutesFromRegistry()` for automatically registering decorator-based routes. |
| `base.ts`     | Extends `AbstractController` to provide `BaseController`, an abstract class for handling HTTP requests. Integrates with `@hono/zod-openapi` for route definition and OpenAPI schema generation. Key methods include `defineRoute` and `bindRoute`. |
| `factory/`  | Contains the `ControllerFactory` and related helpers for generating controllers. |
| `factory/controller.ts` | Provides `ControllerFactory` to generate pre-configured CRUD controllers from a given entity and repository. |
| `factory/definition.ts` | Exports route definition helpers. |
| `common/`     | Contains shared types (`types.ts`) and constants (`constants.ts`) for the controller layer.                                                                                                                                                        |

#### `base/datasources`

| File/Folder | Purpose/Key Details                                                                                                                                                                              |
| :---------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base.ts`   | Contains `AbstractDataSource` and `BaseDataSource`, abstract classes for managing database connections. They define methods for configuration (`configure()`) and retrieving connection strings. |
| `types.ts`  | Defines `IDataSource` interface and `TDataSourceDriver` (e.g., `node-postgres`).                                                                                                                 |

#### `base/helpers`

| File/Folder | Purpose/Key Details                                                                                                                                               |
| :---------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base.ts`   | `BaseHelper` is a generic base class providing common utilities like a logger instance and scope management. Many other helpers and components extend this class. |

#### `base/metadata`

This directory centralizes the metadata handling for decorators, crucial for Ignis's DI and routing systems.

| File/Folder      | Purpose/Key Details                                                                                                                                                             |
| :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `injectors.ts`   | Defines the `@injectable` and `@inject` decorators for dependency injection.                                                                                                    |
| `persistents.ts` | Contains `@model` and `@datasource` decorators for marking classes as data models or data sources, respectively.                                                                |
| `routes.ts`      | Defines the `@controller` decorator for marking classes as API controllers, and the new decorator set (`@api`, `@get`, `@post`, etc.) for defining routes on controller methods. |

#### `base/middlewares`

A collection of essential, low-level middlewares used by the application.

| File/Folder                       | Purpose/Key Details                                                                                            |
| :-------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| `app-error.middleware.ts`         | Global error handling middleware that catches `ApplicationError` instances and formats responses consistently. |
| `emoji-favicon.middleware.ts`     | Serves a simple emoji favicon for the application.                                                             |
| `not-found.middleware.ts`         | Handles 404 Not Found errors.                                                                                  |
| `request-spy.middleware.ts`       | Logs incoming requests, parses request body, and adds a unique request ID for tracing.                         |

#### `base/mixins`

Contains mixins to extend the functionality of core classes, particularly `AbstractApplication`.

| File/Folder           | Purpose/Key Details                                      |
| :-------------------- | :------------------------------------------------------- |
| `component.mixin.ts`  | Adds `component()` and `registerComponents()` methods.   |
| `controller.mixin.ts` | Adds `controller()` and `registerControllers()` methods. |
| `repository.mixin.ts` | Adds `dataSource()` and `repository()` methods.          |
| `service.mixin.ts`    | Adds `service()` method.                                 |
| `types.ts`            | Defines interfaces and types (`TMixinOpts`, `IComponentMixin`, `IControllerMixin`, etc.). |

All registration methods accept an optional `opts?: TMixinOpts` parameter for custom binding configuration:

```typescript
type TMixinOpts<Args extends AnyObject = any> = {
  binding: { namespace: string; key: string };
  args?: Args;
};

// Example: Custom binding key
this.controller(UserController, {
  binding: { namespace: 'controllers', key: 'CustomUserController' }
});
```

#### `base/models`

Defines base classes and utilities for data models, often used with Drizzle ORM.

| File/Folder                        | Purpose/Key Details                                                                                                                                                 |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `base.ts`                          | Contains `BaseEntity`, a base class for models that wrap Drizzle ORM schemas and provide methods for generating Zod schemas for CRUD operations.                    |
| `common/`                          | Contains shared types (`types.ts`) and constants (`constants.ts`) for the model layer, including definitions for `IdType`, `TTableSchemaWithId`, and `SchemaTypes`. |
| `enrichers/`                       | Sub-directory for functions that add common fields to Drizzle ORM schemas.                                                                                          |
| `enrichers/data-type.enricher.ts`  | Adds generic data type columns (number, text, byte, JSON, boolean).                                                                                                 |
| `enrichers/id.enricher.ts`         | Adds `id` column with number (serial) or string (UUID) types.                                                                                                       |
| `enrichers/principal.enricher.ts`  | Adds polymorphic fields for associating with different principal types.                                                                                             |
| `enrichers/tz.enricher.ts`         | Adds `createdAt` and `modifiedAt` timestamp columns.                                                                                                                |
| `enrichers/user-audit.enricher.ts` | Adds `createdBy` and `modifiedBy` fields. Supports `allowAnonymous` option to require or allow anonymous user context.                                              |

#### `base/providers`

| File/Folder | Purpose/Key Details                                                                                                                                                          |
| :---------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base.ts`   | Contains `BaseProvider`, an abstract class for creating custom dependency injection providers. Providers are used for dependencies that require complex instantiation logic. |

#### `base/repositories`

| File/Folder            | Purpose/Key Details                                                                                                                        |
| :--------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| `core/base.ts`         | Defines `AbstractRepository`, the abstract base class for all repositories.                                                                |
| `core/readable.ts`     | Implements `ReadableRepository` for **read-only** data access.                                                                             |
| `core/persistable.ts`  | Implements `PersistableRepository`, extending `ReadableRepository` with write capabilities (`create`, `update`, `delete`).                 |
| `core/default-crud.ts` | Provides `DefaultCRUDRepository`, the standard full CRUD repository that extends `PersistableRepository`.                                  |
| `common/types.ts`      | Defines interfaces for filters (`TFilter`), WHERE clauses (`TWhere`), and repository operations (`IRepository`, `IPersistableRepository`). |

#### `base/services`

| File/Folder | Purpose/Key Details                                                       |
| :---------- | :------------------------------------------------------------------------ |
| `base.ts`   | Defines `BaseService`, the abstract base for all business logic services. |
| `types.ts`  | Defines `IService` and `ICrudService` interfaces.                         |

### `common`

This directory holds various shared definitions and constants used throughout the framework.

| File/Folder       | Purpose/Key Details                                                                                                                                                 |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bindings.ts`     | Defines `BindingNamespaces` (e.g., `COMPONENT`, `SERVICE`) and `BindingKeys` (`APPLICATION_INSTANCE`, `APPLICATION_SERVER`) for the dependency injection container. |
| `constants.ts`    | Contains application-wide constants such as `HTTP` methods and status codes, `MimeTypes`, `RuntimeModules` (Bun, Node.js), and `DataTypes`.                         |
| `environments.ts` | Defines `Environment` types (e.g., `DEVELOPMENT`, `PRODUCTION`) and `EnvironmentKeys` for structured access to environment variables.                               |
| `statuses.ts`     | Defines various status constants like `UserStatuses`, `RoleStatuses`, and `MigrationStatuses`.                                                                      |
| `types.ts`        | Contains general TypeScript utility types like `ValueOrPromise`, `AnyObject`, `IClass`, `TMixinTarget`, and `IProvider`.                                            |

### `components`

This directory contains high-level, pluggable components that encapsulate specific features, extending the application's functionality.

#### `components/auth/`

Provides authentication and authorization features.

| File/Folder                                    | Purpose/Key Details                                                                                                                                |
| :--------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authenticate/`                                | JWT-based authentication.                                                                                                                          |
| `authenticate/common/`                         | Constants, keys, and types for authentication.                                                                                                     |
| `authenticate/component.ts`                    | `AuthenticateComponent` registers authentication services and controllers.                                                                         |
| `authenticate/controllers/factory.ts`          | `defineAuthController` creates a pre-configured controller with sign-in, sign-up, change password, and "who am I" routes.                          |
| `authenticate/services/jwt-token.service.ts`   | `JWTTokenService` handles JWT generation, verification, and payload encryption/decryption.                                                         |
| `authenticate/strategies/`                     | Authentication strategies, e.g., `JWTAuthenticationStrategy`.                                                                                      |
| `authenticate/strategies/strategy-registry.ts` | `AuthenticationStrategyRegistry` manages and provides authentication strategies.                                                                   |
| `models/`                                      | Data models (entities and requests) for authentication, including `User`, `Role`, `Permission`, `SignInRequestSchema`, `SignUpRequestSchema`, etc. |

#### `components/health-check/`

Adds a simple `/health` endpoint to the application.

| File/Folder     | Purpose/Key Details                                           |
| :-------------- | :------------------------------------------------------------ |
| `component.ts`  | `HealthCheckComponent` registers the `HealthCheckController`. |
| `controller.ts` | `HealthCheckController` defines the `/health` route.          |

#### `components/request-tracker/`

Logs and traces incoming requests.

| File/Folder    | Purpose/Key Details                                                                                     |
| :------------- | :------------------------------------------------------------------------------------------------------ |
| `component.ts` | `RequestTrackerComponent` integrates `hono/request-id` and `RequestSpyMiddleware` for request tracking. |

#### `components/socket-io/`

Integrates Socket.IO for real-time communication.

| File/Folder    | Purpose/Key Details                                                                                              |
| :------------- | :--------------------------------------------------------------------------------------------------------------- |
| `component.ts` | `SocketIOComponent` sets up the Socket.IO server, integrates with Redis for scaling, and handles authentication. |

#### `components/swagger/`

Generates interactive OpenAPI documentation.

| File/Folder    | Purpose/Key Details                                                                                                                     |
| :------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| `component.ts` | `SwaggerComponent` configures Swagger UI using `@hono/zod-openapi` and `@hono/swagger-ui`, generating documentation from route schemas. |

### `helpers`

Contains framework extensions and utilities.

| File/Folder | Purpose/Key Details                                                                                                                                        |
| :---------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inversion/`| **Framework DI Extension**: Extends `@venizia/ignis-inversion` to provide application-aware dependency injection with logging and enhanced metadata support. |
| `index.ts`  | Re-exports extensions and utilities from `@venizia/ignis-helpers`. |

### `utilities`

This directory contains pure, standalone utility functions that perform common, stateless operations.

| File/Folder              | Purpose/Key Details                                                                                                                                                                                                                                                     |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crypto.utility.ts`      | Provides a `hash()` function for cryptographic hashing (SHA256, MD5).                                                                                                                                                                                                   |
| `date.utility.ts`        | Date and time manipulation functions (`dayjs` integration, `sleep`, `isWeekday`, `getDateTz`, `hrTime`).                                                                                                                                                                |
| `module.utility.ts`      | `validateModule()` to check for module existence at runtime.                                                                                                                                                                                                            |
| `parse.utility.ts`       | Functions for type checking (`isInt`, `isFloat`), type conversion (`int`, `float`, `toBoolean`), string/object transformation (`toCamel`, `keysToCamel`), array transformations (`parseArrayToRecordWithKey`, `parseArrayToMapWithKey`), and `getUID()` for unique IDs. |
| `performance.utility.ts` | Utilities for measuring code execution time (`executeWithPerformanceMeasure`, `getPerformanceCheckpoint`, `getExecutedPerformance`).                                                                                                                                    |
| `promise.utility.ts`     | Helper functions for Promises (`executePromiseWithLimit`, `isPromiseLike`, `transformValueOrPromise`, `getDeepProperty`).                                                                                                                                               |
| `request.utility.ts`     | Utilities for handling HTTP request data, such as `parseMultipartBody` for multipart form data.                                                                                                                                                                         |
| `schema.utility.ts`      | Helper functions and predefined schemas for `zod` and `@hono/zod-openapi` (`jsonContent`, `jsonResponse`, `requiredString`, `AnyObjectSchema`, `IdParamsSchema`, `UUIDParamsSchema`).                                                                                   |

---

This detailed breakdown illustrates the modular and layered design of the Ignis framework, emphasizing its extensibility and adherence to robust architectural patterns.