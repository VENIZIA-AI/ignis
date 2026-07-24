# Components

Self-contained feature modules you register with `this.component(SomeComponent)`.

## Built-in components

| Component | What it does | When you reach for it |
|---|---|---|
| [Authentication](./authentication/) | JWT and Basic auth - token generation, protected routes, multi-strategy | A route needs to know who the caller is |
| [Authorization](./authorization/) <Badge type="warning" text="Experimental" /> | Enforcer-based RBAC/ABAC, voters, Casbin integration | A route needs a permission check beyond authentication |
| [Health Check](./health-check) | `/health` endpoint, ping/pong | A load balancer or Kubernetes needs a liveness probe |
| [Mail](./mail/) | Email sending - multiple transports, templating, queue-based | The app sends transactional or templated email |
| [Request Tracker](./request-tracker) | Request ID, timing, structured request logging | Always on - registered automatically, nothing to configure |
| [Socket.IO](./socket-io/) | Real-time over Socket.IO - Redis adapter, event-based | Clients need rooms or Socket.IO-specific features |
| [WebSocket](./websocket/) | Native Bun WebSocket, Redis pub/sub, heartbeat | Clients need a raw WebSocket without Socket.IO |
| [Static Asset](./static-asset/) | Upload/download files - MinIO, Bun S3, local disk | The app stores or serves user-uploaded files |
| [API Reference](./api-reference) | OpenAPI generation, Scalar UI by default, Swagger UI optional | You want a browsable UI for your REST routes |
| [gRPC](/references/base/grpc-controllers) | ConnectRPC transport, unary RPC, decorator-based | The app serves gRPC alongside or instead of REST |

## See also

- [Components Overview](/guides/core-concepts/components) - What components are
- [Creating Components](/guides/core-concepts/components-guide) - Build your own
- [BaseComponent API](/references/base/components) - Component base class
- [Application](/references/base/application) - Registering components
- [Architectural Patterns](/best-practices/architectural-patterns) - Component design patterns
