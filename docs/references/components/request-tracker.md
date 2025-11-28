# Request Tracker Component

The Request Tracker component logs incoming requests and adds a unique request ID for tracing purposes.

## Overview

-   **Feature Name:** Request Tracker
-   **Purpose:** To log incoming requests and add a unique request ID for tracing purposes.
-   **Background:** In a production environment, it is crucial to have detailed logs for debugging and monitoring. The Request Tracker component provides a way to automatically log every incoming request with a unique ID, making it easier to trace the entire lifecycle of a request.
-   **Related Features/Modules:** This component is a middleware that is typically registered at the application level. It integrates with the core logging feature.

## Design and Architecture

-   **`RequestTrackerComponent`:** This component registers the `RequestSpyMiddleware`.
-   **`RequestSpyMiddleware`:** A middleware that intercepts incoming requests, logs them, and adds a request ID to the context. It uses the `requestId` middleware from `hono/request-id` to generate the unique ID.

## Implementation Details

### Tech Stack

-   **Hono**
-   **`hono/request-id`**

### Configuration

This component does not require any specific configuration. It is enabled by default when registered.

### Code Samples

#### Registering the Request Tracker Component

In your `src/application.ts`, register the `RequestTrackerComponent`. It is recommended to register this component early in the application's lifecycle, so it can track all incoming requests.

```typescript
// src/application.ts
import { RequestTrackerComponent, BaseApplication } from '@vez/ignis';

export class Application extends BaseApplication {
  // ...

  override async initialize() {
    this.printStartUpInfo({ scope: this.initialize.name });
    this.component(RequestTrackerComponent);

    await super.initialize();
    //...
  }
}
```

When the component is registered, it automatically adds the `requestId` and `RequestSpyMiddleware` to the Hono application instance.

A sample log output for a request would look like this:

```
[spy][<request-id>] START | Handling Request | forwardedIp: 127.0.0.1 | path: /hello | method: GET
[spy][<request-id>] DONE  | Handling Request | forwardedIp: 127.0.0.1 | path: /hello | method: GET | Took: 1.234 (ms)
```

This feature is essential for building production-ready applications with proper logging and traceability.
