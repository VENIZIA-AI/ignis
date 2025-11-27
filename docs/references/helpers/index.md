# Helpers

Helpers are classes and functions that provide common, reusable logic for various tasks within the Ignis framework. They are designed to be easily injectable and configurable.

-   [Cron](./cron.md): A helper for scheduling and managing cron jobs.
-   [Crypto](./crypto.md): Provides utilities for cryptographic operations like hashing, encryption, and decryption (AES, RSA).
-   [Environment](./env.md): A helper for managing and accessing environment variables.
-   [Error](./error.md): Defines custom error classes and a centralized error handling mechanism.
-   [Inversion](./inversion.md): Contains the implementation of the custom dependency injection (DI) container.
-   [Logger](./logger.md): A powerful logging utility built on top of Winston, with support for multiple transports.
-   [Network](./network.md): A suite of helpers for making network requests (HTTP, TCP, UDP).
-   [Queue](./queue.md): Provides abstractions for working with message queues, with support for BullMQ and MQTT.
-   [Redis](./redis.md): A robust helper for interacting with a Redis server or cluster.
-   [Socket.IO](./socket-io.md): Contains low-level helpers for building Socket.IO clients and servers.
-   [Storage](./storage.md): Provides helpers for file storage, including in-memory and Minio object storage.
-   [Testing](./testing.md): A comprehensive set of utilities for writing and running tests, including a test plan runner and base classes for test cases.
-   [Worker Thread](./worker-thread.md): Contains helpers for managing and communicating with Node.js worker threads.
