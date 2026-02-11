# Configuration Options

## Default Server Options

The component applies these defaults if `SocketIOBindingKeys.SERVER_OPTIONS` is not bound or partially overridden:

```typescript
const DEFAULT_SERVER_OPTIONS = {
  identifier: 'SOCKET_IO_SERVER',
  path: '/io',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  },
  perMessageDeflate: {
    threshold: 4096,
    zlibDeflateOptions: { chunkSize: 10 * 1024 },
    zlibInflateOptions: { windowBits: 12, memLevel: 8 },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 20,
  },
};
```

| Option | Default | Description |
|--------|---------|-------------|
| `identifier` | `'SOCKET_IO_SERVER'` | Unique identifier for the helper instance |
| `path` | `'/io'` | URL path for Socket.IO handshake/polling |
| `cors.origin` | `'*'` | Allowed origins (restrict in production!) |
| `cors.credentials` | `true` | Allow cookies/auth headers |
| `perMessageDeflate` | Enabled | WebSocket compression settings |

## Custom Server Options

Override defaults by binding custom options:

```typescript
this.bind<Partial<IServerOptions>>({
  key: SocketIOBindingKeys.SERVER_OPTIONS,
}).toValue({
  identifier: 'my-app-socket',
  path: '/socket.io',
  cors: {
    origin: ['https://myapp.com', 'https://admin.myapp.com'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB
});
```
