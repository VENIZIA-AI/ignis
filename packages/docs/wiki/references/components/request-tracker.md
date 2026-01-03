# Request Tracker Component

The Request Tracker component logs incoming requests and adds a unique request ID for tracing purposes.

## Overview

-   **Feature Name:** Request Tracker
-   **Purpose:** To log incoming requests and add a unique request ID for tracing purposes.
-   **Background:** In a production environment, it is crucial to have detailed logs for debugging and monitoring. The Request Tracker component provides a way to automatically log every incoming request with a unique ID, making it easier to trace the entire lifecycle of a request.
-   **Related Features/Modules:** This component is a default middleware that is registered at the application level and integrates with the core logging feature.

## Design and Architecture

-   **`RequestTrackerComponent`:** This component registers the `RequestSpyMiddleware`.
-   **`RequestSpyMiddleware`:** A middleware that intercepts incoming requests, logs them, and adds a request ID to the context. It uses the `requestId` middleware from `hono/request-id` to generate the unique ID.

## Implementation Details

### Tech Stack

-   **Hono**
-   **`hono/request-id`**

### Configuration

The `RequestTrackerComponent` is enabled by default in `BaseApplication` and requires no manual registration or configuration. It is automatically registered as part of the application's default middleware stack during the `initialize()` lifecycle step.

When the component is active, it adds the `requestId` and `RequestSpyMiddleware` to the Hono application instance. A sample log output for a request would look like this:

```
[spy][<request-id>] START | Handling Request | forwardedIp: 127.0.0.1 | path: /hello | method: GET
[spy][<request-id>] DONE  | Handling Request | forwardedIp: 127.0.0.1 | path: /hello | method: GET | Took: 1.234 (ms)
```

This feature is essential for building production-ready applications with proper logging and traceability.

## See Also

- **Related Concepts:**
  - [Components Overview](/guides/core-concepts/components) - Component system basics
  - [Middlewares](/references/base/middlewares) - Request middleware system

- **Other Components:**
  - [Components Index](./index) - All built-in components

- **References:**
  - [Logger Helper](/references/helpers/logger) - Logging utilities

- **Best Practices:**
  - [Troubleshooting Tips](/best-practices/troubleshooting-tips) - Debugging with request IDs
  - [Deployment Strategies](/best-practices/deployment-strategies) - Production logging
