# Package: `@venizia/ignis-helpers`

## Helpers Package Directory: Detailed Breakdown

The `@venizia/ignis-helpers` package consolidates a wide array of reusable helper classes and utility functions designed to support various cross-cutting concerns within the Ignis framework. This package promotes modularity by extracting common functionalities into a standalone, easily consumable library.

## Project Structure Overview

Here's the top-level breakdown of the `src` directory within `@packages/helpers/`:

| Folder          | Purpose                                                                                                      |
| :-------------- | :----------------------------------------------------------------------------------------------------------- |
| **`__tests__`** | Contains unit and integration tests for the helper utilities.                                                |
| **`base`**      | Provides foundational helper classes, such as `BaseHelper`.                                                  |
| **`common`**    | Stores shared constants and types used across the helpers.                                                   |
| **`helpers`**   | A collection of specialized helper modules for various functionalities (e.g., cron, crypto, network, queue). |
| **`utilities`** | Contains pure, standalone utility functions for common tasks (e.g., parsing, date manipulation).             |

---

## Detailed Sections

### `__tests__`

This directory is dedicated to the test suite for the `@venizia/ignis-helpers` package.

| File/Folder             | Purpose/Key Details                                                        |
| :---------------------- | :------------------------------------------------------------------------- |
| `index.ts`              | Entry point for running tests within the helpers package.                  |
| `jwt/`                  | Contains test cases specifically for JWT-related helper functions, if any. |
| `jwt/test-cases/jwt.ts` | Example: defines `TestCase001` to check JWT creation in a helper context.  |

### `base`

This foundational layer provides base classes that other helpers extend.

#### `base/helpers`

| File/Folder | Purpose/Key Details                                                                                                                      |
| :---------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `base.ts`   | Defines `BaseHelper`, a generic base class providing common utilities like a logger instance and scope management for all other helpers. |

### `common`

This directory holds various shared definitions and constants used throughout the helpers package.

| File/Folder  | Purpose/Key Details                                                                                                                         |
| :----------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| `constants/` | Contains application-wide constants such as `HTTP` methods and status codes, `MimeTypes`, `RuntimeModules` (Bun, Node.js), and `DataTypes`. |
| `types.ts`   | Contains general TypeScript utility types like `ValueOrPromise`, `AnyObject`, `IClass`, `TMixinTarget`, and `IProvider`.                    |

### `helpers`

This directory groups specialized helper modules by their functionality.

#### `helpers/cron/`

| File/Folder      | Purpose/Key Details                                                          |
| :--------------- | :--------------------------------------------------------------------------- |
| `cron.helper.ts` | `CronHelper` for scheduling and managing cron jobs using the `cron` library. |

#### `helpers/crypto/`

Cryptographic utilities.

| File/Folder   | Purpose/Key Details                               |
| :------------ | :------------------------------------------------ |
| `algorithms/` | AES and RSA encryption/decryption algorithms.     |
| `common/`     | Common types and constants for crypto operations. |

#### `helpers/env/`

| File/Folder  | Purpose/Key Details                                                      |
| :----------- | :----------------------------------------------------------------------- |
| `app-env.ts` | `ApplicationEnvironment` for structured access to environment variables. |

#### `helpers/error/`

| File/Folder    | Purpose/Key Details                                       |
| :------------- | :-------------------------------------------------------- |
| `app-error.ts` | `ApplicationError` class for standardized error handling. |

#### `helpers/inversion/`

Application-enhanced Dependency Injection (DI) module that extends `@venizia/ignis-inversion`.

> **Note:** The core DI functionality (Container, Binding, MetadataRegistry base classes) has been extracted to the standalone `@venizia/ignis-inversion` package. This module extends and re-exports that functionality with application-specific enhancements.

| File/Folder    | Purpose/Key Details                                                                                           |
| :------------- | :------------------------------------------------------------------------------------------------------------ |
| `container.ts` | Extended `Container` class with `ApplicationLogger` integration.                                              |
| `registry.ts`  | Extended `MetadataRegistry` with framework-specific metadata (controllers, models, repositories, datasources).|
| `common/keys.ts`| Framework-specific `MetadataKeys` (CONTROLLER, MODEL, REPOSITORY, etc.) merged with base keys.               |
| `common/types.ts`| Framework-specific interfaces (`IControllerMetadata`, `IModelMetadata`, `IRepositoryMetadata`, etc.).        |
| `index.ts`     | Re-exports core classes from `@venizia/ignis-inversion` plus application extensions.                              |

**Re-exported from `@venizia/ignis-inversion`:**
- `Binding`, `BindingKeys`, `BindingScopes`, `BindingValueTypes`

**Application-specific additions:**
- `Container` with `ApplicationLogger` integration
- `MetadataRegistry` with `setControllerMetadata`, `setModelMetadata`, `setRepositoryMetadata`, etc.
- Framework metadata interfaces for controllers, models, repositories, and data sources

For standalone DI usage without framework features, import directly from `@venizia/ignis-inversion`.

#### `helpers/logger/`

Logging solution built on Winston.

| File/Folder                     | Purpose/Key Details                                                    |
| :------------------------------ | :--------------------------------------------------------------------- |
| `application-logger.ts`         | `ApplicationLogger` for structured logging with scopes.                |
| `default-logger.ts`             | Default Winston logger configuration with console and file transports. |
| `factory.ts`                    | `LoggerFactory` for obtaining logger instances.                        |
| `transports/dgram.transport.ts` | UDP transport for log aggregation.                                     |
| `types.ts`                      | Log level definitions.                                                 |

#### `helpers/network/`

Utilities for network communication.

| File/Folder     | Purpose/Key Details                                                             |
| :-------------- | :------------------------------------------------------------------------------ |
| `http-request/` | HTTP client implementations (`AxiosNetworkRequest`, `NodeFetchNetworkRequest`). |
| `tcp-socket/`   | TCP and TLS socket client/server helpers.                                       |
| `udp-socket/`   | UDP client helper.                                                              |

#### `helpers/queue/`

Message queuing solutions.

| File/Folder | Purpose/Key Details                             |
| :---------- | :---------------------------------------------- |
| `bullmq/`   | `BullMQHelper` for Redis-backed message queues. |
| `mqtt/`     | `MQTTClientHelper` for MQTT broker interaction. |
| `internal/` | `QueueHelper` for simple in-memory queues.      |
| `common/`   | Common types for queue operations.              |

#### `helpers/redis/`

Redis client helpers.

| File/Folder         | Purpose/Key Details                                                |
| :------------------ | :----------------------------------------------------------------- |
| `cluster.helper.ts` | `RedisClusterHelper` for Redis cluster connections.                |
| `default.helper.ts` | `DefaultRedisHelper` providing a unified API for Redis operations. |
| `single.helper.ts`  | `RedisHelper` for single Redis instance connections.               |
| `types.ts`          | Interfaces and types for Redis helpers.                            |

#### `helpers/socket-io/`

Socket.IO client and server helpers.

| File/Folder | Purpose/Key Details                                           |
| :---------- | :------------------------------------------------------------ |
| `client/`   | `SocketIOClientHelper` for client-side Socket.IO connections. |
| `server/`   | `SocketIOServerHelper` for server-side Socket.IO management.  |
| `common/`   | Common types and constants for Socket.IO.                     |

#### `helpers/storage/`

Storage utilities.

| File/Folder  | Purpose/Key Details                                    |
| :----------- | :----------------------------------------------------- |
| `in-memory/` | `MemoryStorageHelper` for in-memory key-value storage. |
| `minio/`     | `MinioHelper` for S3-compatible object storage.        |

#### `helpers/testing/`

Framework for writing and executing tests using `node:test`.

| File/Folder         | Purpose/Key Details                                         |
| :------------------ | :---------------------------------------------------------- |
| `base-test-plan.ts` | Abstract base for test plans.                               |
| `common/`           | Common types and constants for testing utilities.           |
| `describe.ts`       | `TestDescribe` integrates with `node:test` lifecycle hooks. |
| `test-case.ts`      | Defines individual test cases.                              |
| `test-handler.ts`   | Base class for test case handlers.                          |
| `test-plan.ts`      | `TestPlan` for organizing test suites.                      |

#### `helpers/worker-thread/`

Utilities for Node.js worker threads.

| File/Folder      | Purpose/Key Details                                         |
| :--------------- | :---------------------------------------------------------- |
| `base.ts`        | Base classes for workers and worker threads.                |
| `types.ts`       | Interfaces and types for worker threads.                    |
| `worker-bus.ts`  | Helpers for inter-thread communication using `MessagePort`. |
| `worker-pool.ts` | `WorkerPoolHelper` for managing a pool of worker threads.   |

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
