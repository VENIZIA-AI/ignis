// The application class. `src/index.ts` starts it; the smoke test boots the same class.
import {
  ApiReferenceComponent,
  BaseApplication,
  HealthCheckComponent,
  IApplicationInfo,
  ValueOrPromise,
} from '@venizia/ignis';
import { SocketIOBindingKeys, SocketIOComponent } from '@venizia/ignis/socket-io';
import { RedisSingleHelper } from '@venizia/ignis-helpers';
import type {
  SocketIOServerHelper,
  TSocketIOAuthenticateFn,
} from '@venizia/ignis-helpers/socket-io';
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
    this.setupSocketIO();
  }

  override postConfigure(): void {}

  override setupMiddlewares(): void {}

  private setupSocketIO(): void {
    // `autoConnect: false` - the component duplicates this connection into 3 Redis clients (pub,
    // sub, emitter) and connects them itself during `configure()`. Connecting here first would
    // race the duplicates.
    this.redisHelper = new RedisSingleHelper({
      name: 'socket-io-redis',
      host: process.env.APP_ENV_REDIS_HOST ?? 'localhost',
      port: Number(process.env.APP_ENV_REDIS_PORT ?? 16380),
      password: process.env.APP_ENV_REDIS_PASSWORD ?? '',
      autoConnect: false,
    });
    this.bind<RedisSingleHelper>({ key: SocketIOBindingKeys.REDIS_CONNECTION }).toValue(
      this.redisHelper,
    );

    // Every client must send this token as `Bearer <token>` before it can join a room or exchange
    // messages - the handshake IGNIS requires regardless of transport.
    const expectedToken = process.env.APP_ENV_AUTH_TOKEN ?? 'demo-token';
    const authenticateFn: TSocketIOAuthenticateFn = handshake =>
      handshake.headers.authorization === `Bearer ${expectedToken}`;
    this.bind<TSocketIOAuthenticateFn>({ key: SocketIOBindingKeys.AUTHENTICATE_HANDLER }).toValue(
      authenticateFn,
    );

    this.component(SocketIOComponent);

    // SOCKET_IO_INSTANCE is only bound after the server starts, so it is resolved here rather than
    // captured at registration time.
    this.registerPostStopHook({
      identifier: 'socket-io.shutdown',
      hook: async () => {
        const socketIOHelper = this.get<SocketIOServerHelper>({
          key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
          isOptional: true,
        });
        await socketIOHelper?.shutdown();
        await this.redisHelper?.disconnect();
      },
    });
  }
}
