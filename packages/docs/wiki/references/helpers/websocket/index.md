# WebSocket Helpers

Bun-native WebSocket server and emitter for real-time communication. Provides post-connection authentication, room management, Redis Pub/Sub scaling, application-level heartbeat, and lifecycle management out of the box.

> [!IMPORTANT]
> **Bun only.** This WebSocket implementation uses Bun's native WebSocket API. It will throw an error if you attempt to use it on a Node.js runtime. For Node.js support, use the [Socket.IO Helper](../socket-io/) instead.
