# Ignis Framework

Welcome to Ignis, a powerful and extensible backend framework for TypeScript, built on top of [Hono](https://hono.dev/). It is designed to be modular, scalable, and easy to use, providing a solid foundation for building modern, high-performance web applications and APIs.

## Core Concepts

Ignis is built around a few core concepts that make it flexible and powerful:

- **Dependency Injection:** The framework uses a custom, lightweight dependency injection container inspired by InversifyJS. This allows for loose coupling and better testability of your code.
- **Component-Based Architecture:** Functionality is organized into reusable **Components**. Each component encapsulates a specific feature (e.g., Authentication, Swagger UI, Socket.IO) and can be easily registered with the application.
- **Controllers, Services, and Repositories:** The framework follows a classic layered architecture pattern:
  - **Controllers** handle incoming HTTP requests.
  - **Services** contain the core business logic.
  - **Repositories** abstract data access and interact with DataSources.
- **Metadata and Decorators:** Ignis uses decorators (`@controller`, `@inject`, etc.) to define metadata for routing, dependency injection, and more, keeping your code clean and declarative.

## Project Structure

The `src` directory is the heart of the Ignis framework. Here's a breakdown of its structure and the purpose of each folder:

| Folder | Purpose |
| :--- | :--- |
| **`__tests__`** | Contains integration and end-to-end tests for the framework's features. |
| **`base`** | The core building blocks and abstract classes of the framework. This is where the fundamental architecture is defined. |
| `base/applications` | Contains the main `Application` class, which is the entry point of any Ignis application. It handles server setup, middleware registration, and component lifecycle. |
| `base/components` | Defines the `BaseComponent` class, from which all feature components should inherit. |
| `base/controllers` | Contains the `BaseController` class, providing the foundation for creating REST API controllers with route definition helpers. |
| `base/datasources` | Provides the `BaseDataSource` class for connecting to various data sources like databases. |
| `base/helpers` | Contains the `BaseHelper` class, a generic base class for helper utilities. |
| `base/metadata` | Defines decorators (`@controller`, `@model`, `@inject`) and the metadata registry for the framework's DI and routing system. |
| `base/middlewares` | A collection of essential, low-level middlewares for handling errors, 404s, and request normalization. |
| `base/mixins` | Contains mixins for extending the functionality of core classes like the `Application` class. |
| `base/models` | Defines base classes for data models and entities (`Entity`, `BaseNumberIdEntity`), along with "enrichers" for automatically adding common fields like IDs, timestamps, and user audit trails. |
| `base/repositories` | Contains the `BaseRepository` class, which provides a blueprint for data access logic (CRUD operations). |
| `base/services` | Contains `BaseService` and `BaseCrudService` to provide a structure for implementing business logic. |
| **`common`** | A directory for code that is shared and used across the entire framework. |
| `common/bindings.ts` | Defines constant keys and namespaces for dependency injection bindings. |
| `common/constants.ts` | Contains application-wide constants, such as HTTP status codes, methods, and other fixed values. |
| `common/environments.ts` | Defines environment-related constants and utility functions. |
| `common/statuses.ts` | Defines common status constants (e.g., for users, roles, migrations). |
| `common/types.ts` | Contains common TypeScript types, interfaces, and type utilities used throughout the project. |
| **`components`** | A collection of ready-to-use, high-level components that can be plugged into an Ignis application. |
| `components/auth` | Provides a complete authentication and authorization system, including JWT/Bearer strategies, middlewares, and role-based access control. |
| `components/health-check` | A simple component that exposes a `/health` endpoint to check the application's status. |
| `components/request-tracker`| A middleware component for logging and tracking incoming requests. |
| `components/socket-io` | A component for integrating real-time bidirectional communication using Socket.IO. |
| `components/swagger` | Automatically generates interactive API documentation using Swagger UI and OpenAPI specifications. |
| **`helpers`** | A collection of helper classes and functions for various tasks. |
| `helpers/cron` | A helper for scheduling and managing cron jobs. |
| `helpers/crypto` | Provides utilities for cryptographic operations like hashing, encryption, and decryption (AES, RSA). |
| `helpers/env` | A helper for managing and accessing environment variables. |
| `helpers/error` | Defines custom error classes and a centralized error handling mechanism. |
| `helpers/inversion` | Contains the implementation of the custom dependency injection (DI) container. |
| `helpers/logger` | A powerful logging utility built on top of Winston, with support for multiple transports. |
| `helpers/network` | A suite of helpers for making network requests (HTTP, TCP, UDP). |
| `helpers/queue` | Provides abstractions for working with message queues, with support for BullMQ and MQTT. |
| `helpers/redis` | A robust helper for interacting with a Redis server or cluster. |
| `helpers/socket-io` | Contains low-level helpers for building Socket.IO clients and servers. |
| `helpers/storage` | Provides helpers for file storage, including in-memory and Minio object storage. |
| `helpers/testing` | A comprehensive set of utilities for writing and running tests, including a test plan runner and base classes for test cases. |
| `helpers/worker-thread`| Contains helpers for managing and communicating with Node.js worker threads. |
| **`utilities`** | A collection of pure, standalone utility functions. |
| `utilities/crypto.utility.ts`| Simple, stateless cryptographic functions. |
| `utilities/date.utility.ts` | Provides date and time manipulation functions, built on `dayjs`. |
| `utilities/module.utility.ts`| A utility for checking if a Node.js module is installed. |
| `utilities/parse.utility.ts` | A collection of functions for parsing and converting data types (e.g., strings to numbers, camelCase conversion). |
| `utilities/performance.utility.ts`| Utilities for measuring code execution time. |
| `utilities/promise.utility.ts`| Helper functions for working with Promises. |
| `utilities/request.utility.ts`| Utilities for handling HTTP requests, such as parsing multipart form data. |
| `utilities/schema.utility.ts`| Helpers for creating and validating Zod schemas, especially for request and response validation in an OpenAPI context. |

---

This structure is designed to promote separation of concerns, modularity, and reusability, making it easier to build and maintain complex applications.
