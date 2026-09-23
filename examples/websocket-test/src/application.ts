// The application class. `src/index.ts` starts it; the smoke test boots the same class.
import {
  ApiReferenceComponent,
  BaseApplication,
  HealthCheckComponent,
  IApplicationInfo,
  ValueOrPromise,
} from '@venizia/ignis';
import { WebSocketBindingKeys, WebSocketComponent } from '@venizia/ignis/websocket';
import {
  RedisSingleHelper,
  TWebSocketAuthenticateFn,
  WebSocketServerHelper,
} from '@venizia/ignis-helpers';
import appInfo from '../package.json';

// Importing a decorated class is what registers it: `discoverArtifacts: true` binds every one.
import './controllers/chat.controller';

export class Application extends BaseApplication {
  private redisHelper?: RedisSingleHelper;

  override getAppInfo(): IApplicationInfo {
    return appInfo;
  }

  override staticConfigure(): void {}

  override preConfigure(): ValueOrPromise<void> {
    this.component(ApiReferenceComponent);
    this.component(HealthCheckComponent);
    this.setupWebSocket();
  }

  override postConfigure(): void {}

  override setupMiddlewares(): void {}

  private setupWebSocket(): void {
    // `autoConnect: false` - the component duplicates this connection into 2 Redis clients (pub,
    // sub) and connects them itself during `configure()`. Connecting here first would race the
    // duplicates.
    this.redisHelper = new RedisSingleHelper({
      name: 'websocket-redis',
      host: process.env.APP_ENV_REDIS_HOST ?? 'localhost',
      port: Number(process.env.APP_ENV_REDIS_PORT ?? 16381),
      password: process.env.APP_ENV_REDIS_PASSWORD ?? '',
      autoConnect: false,
    });
    this.bind<RedisSingleHelper>({ key: WebSocketBindingKeys.REDIS_CONNECTION }).toValue(
      this.redisHelper,
    );

    // A client sends this token in its `authenticate` message before it can join a room or
    // exchange messages - the handshake IGNIS requires regardless of transport.
    const expectedToken = process.env.APP_ENV_AUTH_TOKEN ?? 'demo-token';
    const authenticateFn: TWebSocketAuthenticateFn = data => {
      const token = typeof data.token === 'string' ? data.token : undefined;
      if (token !== expectedToken) {
        return null;
      }

      const userId = typeof data.userId === 'string' ? data.userId : 'anonymous';
      return { userId };
    };
    this.bind<TWebSocketAuthenticateFn>({ key: WebSocketBindingKeys.AUTHENTICATE_HANDLER }).toValue(
      authenticateFn,
    );

    this.component(WebSocketComponent);

    // WEBSOCKET_INSTANCE is only bound after the server starts, so it is resolved here rather than
    // captured at registration time.
    this.registerPostStopHook({
      identifier: 'websocket.shutdown',
      hook: async () => {
        const webSocketHelper = this.get<WebSocketServerHelper>({
          key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
          isOptional: true,
        });
        await webSocketHelper?.shutdown();
        await this.redisHelper?.disconnect();
      },
    });
  }
}
