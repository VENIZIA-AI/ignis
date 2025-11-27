# `src` Directory: Detailed Breakdown

The `src` directory is the core of the Ignis framework, housing all the fundamental building blocks, architectural layers, and modular features. This document provides a more in-depth look into each sub-directory within `src`, explaining their purpose, key components, and how they contribute to the overall framework.

## Project Structure Overview

For a quick reference, here's the top-level breakdown of the `src` directory:

| Folder | Purpose |
| :--- | :--- |
| **`__tests__`** | Contains integration and end-to-end tests for the framework's features. |
| **`base`** | The core building blocks and abstract classes of the framework. This is where the fundamental architecture is defined. |
| **`common`** | A directory for code that is shared and used across the entire framework. |
| **`components`** | A collection of ready-to-use, high-level components that can be plugged into an Ignis application. |
| **`helpers`** | A collection of helper classes and functions for various tasks. |
| **`utilities`** | A collection of pure, standalone utility functions. |

---

## Detailed Sections

### `__tests__`
This directory is dedicated to the framework's test suite.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `jwt/`      | Contains test cases specifically for the JWT authentication functionality, demonstrating how tokens are generated and validated. |
| `jwt/test-cases/jwt.ts` | Example: defines `TestCase001` to check JWT creation. |

### `base`
This is the foundational layer of Ignis, defining the core architecture and abstract classes that other parts of the framework extend or implement.

#### `base/applications`
| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `abstract.ts` | Defines `AbstractApplication`, the base class for Ignis applications. Handles core server setup (Hono instance, runtime detection for Bun/Node.js), environment validation, and route inspection. Mandates abstract methods for middleware setup and configuration. |
| `base.ts`   | Extends `AbstractApplication` to provide `BaseApplication`, implementing common functionalities like component, controller, service, repository, and datasource registration. Includes default middleware registration (e.g., error handling, favicon, request tracking) and startup information logging. |
| `types.ts`  | Contains interfaces for application configurations (`IApplicationConfigs`), application information (`IApplicationInfo`), and various middleware options (e.g., `ICORSOptions`, `ICSRFOptions`). |

#### `base/components`
| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `base.ts`   | Defines `BaseComponent`, the abstract class for all pluggable components. Manages component-specific bindings and a `configure()` method for setup logic. |

#### `base/controllers`
| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `base.ts`   | Provides `BaseController`, an abstract class for handling HTTP requests. Integrates with `@hono/zod-openapi` for route definition and OpenAPI schema generation. Key methods include `defineRoute` (for public endpoints) and `defineAuthRoute` (for authenticated/authorized endpoints using strategies like JWT). |
| `types.ts`  | Defines interfaces related to controllers, such as `IControllerOptions` and `TRouteDefinition`. |

#### `base/datasources`
| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `base.ts`   | Contains `AbstractDataSource` and `BaseDataSource`, abstract classes for managing database connections. They define methods for configuration (`configure()`) and retrieving connection strings. |
| `types.ts`  | Defines `IDataSource` interface and `TDataSourceDriver` (e.g., `node-postgres`). |

#### `base/helpers`
| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `base.ts`   | `BaseHelper` is a generic base class providing common utilities like a logger instance and scope management. Many other helpers and components extend this class. |

#### `base/metadata`
This directory centralizes the metadata handling for decorators, crucial for Ignis's DI and routing systems.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `injectors.ts` | Defines the `@injectable` and `@inject` decorators for dependency injection. |
| `persistents.ts` | Contains `@model` and `@datasource` decorators for marking classes as data models or data sources, respectively. |
| `routes.ts`   | Defines the `@controller` decorator for marking classes as API controllers. |

#### `base/middlewares`
A collection of essential, low-level middlewares used by the application.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `app-error.middleware.ts` | Global error handling middleware that catches `ApplicationError` instances and formats responses consistently. |
| `default-api-hook.middleware.ts` | Provides a default hook for API routes, especially for handling validation errors from Zod schemas. |
| `emoji-favicon.middleware.ts` | Serves a simple emoji favicon for the application. |
| `not-found.middleware.ts` | Handles 404 Not Found errors. |
| `request-normalize.middleware.ts` | Normalizes incoming requests, particularly for parsing JSON bodies. |
| `request-spy.middleware.ts` | Logs incoming requests and adds a unique request ID for tracing. |

#### `base/mixins`
Contains mixins to extend the functionality of core classes, particularly `AbstractApplication`.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `component.mixin.ts` | Adds `component()` and `registerComponents()` methods. |
| `controller.mixin.ts` | Adds `controller()` and `registerControllers()` methods. |
| `repository.mixin.ts` | Adds `dataSource()` and `repository()` methods. |
| `service.mixin.ts` | Adds `service()` method. |
| `types.ts`    | Defines interfaces for these mixins. |

#### `base/models`
Defines base classes and utilities for data models, often used with Drizzle ORM.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `base.ts`   | Contains `Entity` (base for all models), `BaseNumberIdEntity`, `BaseStringIdEntity` (for auto-generated IDs), `BaseNumberTzEntity`, `BaseStringTzEntity` (for `createdAt`/`modifiedAt` timestamps), and `BaseNumberUserAuditTzEntity`, `BaseStringUserAuditTzEntity` (for user audit fields). |
| `enrichers/` | Sub-directory for functions that add common fields to Drizzle ORM schemas. |
| `enrichers/data-type.enricher.ts` | Adds generic data type columns (number, text, byte, JSON, boolean). |
| `enrichers/id.enricher.ts` | Adds `id` column with number (serial) or string (UUID) types. |
| `enrichers/principal.enricher.ts` | Adds polymorphic fields for associating with different principal types. |
| `enrichers/tz.enricher.ts` | Adds `createdAt` and `modifiedAt` timestamp columns. |
| `enrichers/user-audit.enricher.ts` | Adds `createdBy` and `modifiedBy` fields. |
| `types.ts`    | Defines types related to models, entities, and Drizzle ORM columns. |

#### `base/repositories`
| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `base.ts`   | Defines `BaseRepository` (abstract base for all repositories) and `DefaultCrudRepository` (provides basic CRUD operations, intended for Drizzle ORM integration). |
| `types.ts`  | Defines interfaces for filters (`IFilter`), WHERE clauses (`TWhere`), and repository operations (`IRepository`, `IPersistableRepository`). |

#### `base/services`
| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `base.ts`   | Defines `BaseService`, the abstract base for all business logic services. |
| `base-crud.ts`| Provides `BaseCrudService`, an abstract service class that wraps `DefaultCrudRepository` for common CRUD operations. |
| `types.ts`  | Defines `IService` and `ICrudService` interfaces. |

### `common`
This directory holds various shared definitions and constants used throughout the framework.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `bindings.ts` | Defines `BindingNamespaces` (e.g., `COMPONENT`, `SERVICE`) and `BindingKeys` (`APPLICATION_INSTANCE`, `APPLICATION_SERVER`) for the dependency injection container. |
| `constants.ts` | Contains application-wide constants such as `HTTP` methods and status codes, `MimeTypes`, `RuntimeModules` (Bun, Node.js), and `DataTypes`. |
| `environments.ts` | Defines `Environment` types (e.g., `DEVELOPMENT`, `PRODUCTION`) and `EnvironmentKeys` for structured access to environment variables. |
| `statuses.ts` | Defines various status constants like `UserStatuses`, `RoleStatuses`, and `MigrationStatuses`. |
| `types.ts`    | Contains general TypeScript utility types like `ValueOrPromise`, `AnyObject`, `IClass`, `TMixinTarget`, and `IProvider`. |

### `components`
This directory contains high-level, pluggable components that encapsulate specific features, extending the application's functionality.

#### `components/auth/`
Provides authentication and authorization features.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `authenticate/` | JWT-based authentication. |
| `authenticate/common/` | Constants, keys, and types for authentication. |
| `authenticate/component.ts` | `AuthenticateComponent` registers authentication services and controllers. |
| `authenticate/controllers/factory.ts` | `defineAuthController` creates a pre-configured controller with sign-in, sign-up, change password, and "who am I" routes. |
| `authenticate/services/jwt-token.service.ts` | `JWTTokenService` handles JWT generation, verification, and payload encryption/decryption. |
| `authenticate/strategies/` | Authentication strategies, e.g., `JWTAuthenticationStrategy`. |
| `authenticate/strategies/strategy-registry.ts` | `AuthenticationStrategyRegistry` manages and provides authentication strategies. |
| `models/`     | Data models (entities and requests) for authentication, including `User`, `Role`, `Permission`, `SignInRequestSchema`, `SignUpRequestSchema`, etc. |

#### `components/health-check/`
Adds a simple `/health` endpoint to the application.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `component.ts` | `HealthCheckComponent` registers the `HealthCheckController`. |
| `controller.ts` | `HealthCheckController` defines the `/health` route. |

#### `components/request-tracker/`
Logs and traces incoming requests.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `component.ts` | `RequestTrackerComponent` integrates `hono/request-id` and `RequestSpyMiddleware` for request tracking. |

#### `components/socket-io/`
Integrates Socket.IO for real-time communication.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `component.ts` | `SocketIOComponent` sets up the Socket.IO server, integrates with Redis for scaling, and handles authentication. |

#### `components/swagger/`
Generates interactive OpenAPI documentation.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `component.ts` | `SwaggerComponent` configures Swagger UI using `@hono/zod-openapi` and `@hono/swagger-ui`, generating documentation from route schemas. |

### `helpers`
This directory contains various helper classes and functions that provide reusable logic for specific tasks, often injectable via DI.

#### `helpers/cron/`
| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `cron.helper.ts` | `CronHelper` for scheduling and managing cron jobs using the `cron` library. |

#### `helpers/crypto/`
Cryptographic utilities.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `algorithms/` | AES and RSA encryption/decryption. |
| `common/`     | Common types and constants for crypto operations. |

#### `helpers/env/`
| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `app-env.ts` | `ApplicationEnvironment` for structured access to environment variables. |

#### `helpers/error/`
| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `app-error.ts` | `ApplicationError` class for standardized error handling. |

#### `helpers/inversion/`
Implementation of the custom Dependency Injection (DI) container.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `container.ts` | `Binding` class for defining dependencies and `Container` for managing them. |
| `keys.ts`     | `MetadataKeys` for decorator metadata. |
| `registry.ts` | `MetadataRegistry` for storing and retrieving metadata. |
| `types.ts`    | Interfaces and types related to DI. |

#### `helpers/logger/`
Logging solution built on Winston.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `application-logger.ts` | `ApplicationLogger` for structured logging with scopes. |
| `default-logger.ts` | Default Winston logger configuration with console and file transports. |
| `factory.ts`  | `LoggerFactory` for obtaining logger instances. |
| `transports/dgram.transport.ts` | UDP transport for log aggregation. |
| `types.ts`    | Log level definitions. |

#### `helpers/network/`
Utilities for network communication.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `http-request/` | HTTP client implementations (`AxiosNetworkRequest`, `NodeFetchNetworkRequest`). |
| `tcp-socket/` | TCP and TLS socket client/server helpers. |
| `udp-socket/` | UDP client helper. |

#### `helpers/queue/`
Message queuing solutions.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `bullmq.helper.ts` | `BullMQHelper` for Redis-backed message queues. |
| `mqtt.helper.ts` | `MQTTClientHelper` for MQTT broker interaction. |
| `queue.helper.ts` | `QueueHelper` for simple in-memory queues. |

#### `helpers/redis/`
Redis client helpers.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `default.helper.ts` | `DefaultRedisHelper` providing a unified API for Redis operations. |
| `redis-cluster.helper.ts` | `RedisClusterHelper` for Redis cluster connections. |
| `redis.helper.ts` | `RedisHelper` for single Redis instance connections. |

#### `helpers/socket-io/`
Socket.IO client and server helpers.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `socket-io-client.helper.ts` | `SocketIOClientHelper` for client-side Socket.IO connections. |
| `socket-io-server.helper.ts` | `SocketIOServerHelper` for server-side Socket.IO management. |

#### `helpers/storage/`
Storage utilities.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `memory-storage.helper.ts` | `MemoryStorageHelper` for in-memory key-value storage. |
| `minio.helper.ts` | `MinioHelper` for S3-compatible object storage. |

#### `helpers/testing/`
Framework for writing and executing tests using `node:test`.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `base-test-plan.ts` | Abstract base for test plans. |
| `test-case.ts` | Defines individual test cases. |
| `test-handler.ts` | Base class for test case handlers. |
| `test-plan.ts` | `TestPlan` for organizing test suites. |
| `describe.ts` | `TestDescribe` integrates with `node:test` lifecycle hooks. |

#### `helpers/worker-thread/`
Utilities for Node.js worker threads.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `base.ts`     | Base classes for workers and worker threads. |
| `worker-bus.ts` | Helpers for inter-thread communication using `MessagePort`. |
| `worker-pool.ts` | `WorkerPoolHelper` for managing a pool of worker threads. |

### `utilities`
This directory contains pure, standalone utility functions that perform common, stateless operations.

| File/Folder | Purpose/Key Details |
| :---------- | :------------------ |
| `crypto.utility.ts` | Provides a `hash()` function for cryptographic hashing (SHA256, MD5). |
| `date.utility.ts` | Date and time manipulation functions (`dayjs` integration, `sleep`, `isWeekday`, `getDateTz`, `hrTime`). |
| `module.utility.ts` | `validateModule()` to check for module existence at runtime. |
| `parse.utility.ts` | Functions for type checking (`isInt`, `isFloat`), type conversion (`int`, `float`, `toBoolean`), string/object transformation (`toCamel`, `keysToCamel`), array transformations (`parseArrayToRecordWithKey`, `parseArrayToMapWithKey`), and `getUID()` for unique IDs. |
| `performance.utility.ts` | Utilities for measuring code execution time (`executeWithPerformanceMeasure`, `getPerformanceCheckpoint`, `getExecutedPerformance`). |
| `promise.utility.ts` | Helper functions for Promises (`executePromiseWithLimit`, `isPromiseLike`, `transformValueOrPromise`, `getDeepProperty`). |
| `request.utility.ts` | Utilities for handling HTTP request data, such as `parseMultipartBody` for multipart form data. |
| `schema.utility.ts` | Helper functions and predefined schemas for `zod` and `@hono/zod-openapi` (`jsonContent`, `jsonResponse`, `requiredString`, `AnyObjectSchema`, `IdParamsSchema`, `UUIDParamsSchema`).

---
This detailed breakdown illustrates the modular and layered design of the Ignis framework, emphasizing its extensibility and adherence to robust architectural patterns.