# Configuration Options

## Default Server Options

The component applies these defaults if `WebSocketBindingKeys.SERVER_OPTIONS` is not bound or partially overridden:

```typescript
const DEFAULT_SERVER_OPTIONS: IServerOptions = {
  identifier: 'WEBSOCKET_SERVER',
  path: '/ws',
};
```

| Option | Default | Description |
|--------|---------|-------------|
| `identifier` | `'WEBSOCKET_SERVER'` | Unique identifier for the helper instance |
| `path` | `'/ws'` | URL path for WebSocket upgrade requests |
| `defaultRooms` | `undefined` | Falls back to helper default: `['ws-default', 'ws-notification']` |
| `serverOptions` | `undefined` | Falls back to helper defaults (`sendPings: true`, `idleTimeout: 60`) |
| `heartbeatInterval` | `undefined` | Falls back to `30000` (30s) |
| `heartbeatTimeout` | `undefined` | Falls back to `90000` (90s) |
| `requireEncryption` | `undefined` | Falls back to `false` -- when `true`, clients must complete ECDH handshake during auth |

## `IServerOptions`

```typescript
interface IServerOptions {
  identifier: string;
  path?: string;
  defaultRooms?: string[];
  serverOptions?: IBunWebSocketConfig;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  requireEncryption?: boolean;
}
```

## Custom Server Options

Override defaults by binding custom options:

```typescript
this.bind<Partial<IServerOptions>>({
  key: WebSocketBindingKeys.SERVER_OPTIONS,
}).toValue({
  identifier: 'my-app-websocket',
  path: '/realtime',
  defaultRooms: ['app-default', 'app-notifications', 'app-alerts'],
  serverOptions: {
    maxPayloadLength: 256 * 1024,  // 256KB
    idleTimeout: 120,              // 2 minutes
    perMessageDeflate: true,
  },
  heartbeatInterval: 15_000,       // 15 seconds
  heartbeatTimeout: 45_000,        // 45 seconds
});
```
