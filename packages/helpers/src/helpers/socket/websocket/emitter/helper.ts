import { HTTP } from '@/common';
import { BaseHelper } from '@/helpers/base';
import { getError } from '@/helpers/error';
import { Cluster, Redis } from 'ioredis';
import {
  IRedisSocketMessage,
  IWebSocketEmitterOptions,
  WebSocketChannels,
  WebSocketMessageTypes,
} from '../common';

type TRedisClient = Redis | Cluster;

const EMITTER_SERVER_ID = 'emitter';

// -------------------------------------------------------------------------------------------------------------
export class WebSocketEmitter extends BaseHelper {
  private redisPub: TRedisClient;

  // -------------------------------------------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------------------------------------------
  constructor(opts: IWebSocketEmitterOptions) {
    super({ scope: opts.identifier ?? WebSocketEmitter.name });

    this.identifier = opts.identifier ?? WebSocketEmitter.name;
    this.initRedisClient(opts.redisConnection);
  }

  private initRedisClient(redisConnection: IWebSocketEmitterOptions['redisConnection']) {
    if (!redisConnection) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[WebSocketEmitter] Invalid redis connection!',
      });
    }

    const client = redisConnection.getClient();
    this.redisPub = client.duplicate();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------------------------------------------
  private waitForRedisReady(client: TRedisClient, opts?: { timeoutMs?: number }): Promise<void> {
    const timeoutMs = opts?.timeoutMs ?? 30_000;

    return new Promise((resolve, reject) => {
      if (client.status === 'ready') {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        reject(
          new Error(
            `Redis client did not become ready within ${timeoutMs}ms (status: ${client.status})`,
          ),
        );
      }, timeoutMs);

      client.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });
      client.once('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async configure() {
    const logger = this.logger.for(this.configure.name);
    logger.info('Configuring WebSocket Emitter | id: %s', this.identifier);

    this.redisPub.on('error', (error: Error) => {
      logger.error('Redis pub error | error: %j', error);
    });

    if (this.redisPub.status === 'wait') {
      this.redisPub.connect();
    }

    await this.waitForRedisReady(this.redisPub);
    logger.info('WebSocket Emitter READY');
  }

  // -------------------------------------------------------------------------------------------------------------
  // Publish Helpers
  // -------------------------------------------------------------------------------------------------------------
  private async publish(opts: {
    channel: string;
    type: IRedisSocketMessage['type'];
    target?: string;
    event: string;
    data: unknown;
    exclude?: string[];
  }) {
    const { channel, type, target, event, data, exclude } = opts;

    const message: IRedisSocketMessage = {
      serverId: EMITTER_SERVER_ID,
      type,
      target,
      event,
      data,
      exclude,
    };

    await this.redisPub.publish(channel, JSON.stringify(message));
  }

  // -------------------------------------------------------------------------------------------------------------
  // Emit Methods
  // -------------------------------------------------------------------------------------------------------------
  async toClient(opts: { clientId: string; event: string; data: unknown }) {
    const { clientId, event, data } = opts;
    await this.publish({
      channel: WebSocketChannels.forClient({ clientId }),
      type: WebSocketMessageTypes.CLIENT,
      target: clientId,
      event,
      data,
    });
  }

  async toUser(opts: { userId: string; event: string; data: unknown }) {
    const { userId, event, data } = opts;
    await this.publish({
      channel: WebSocketChannels.forUser({ userId }),
      type: WebSocketMessageTypes.USER,
      target: userId,
      event,
      data,
    });
  }

  async toRoom(opts: { room: string; event: string; data: unknown; exclude?: string[] }) {
    const { room, event, data, exclude } = opts;
    await this.publish({
      channel: WebSocketChannels.forRoom({ room }),
      type: WebSocketMessageTypes.ROOM,
      target: room,
      event,
      data,
      exclude,
    });
  }

  async broadcast(opts: { event: string; data: unknown }) {
    const { event, data } = opts;
    await this.publish({
      channel: WebSocketChannels.BROADCAST,
      type: WebSocketMessageTypes.BROADCAST,
      event,
      data,
    });
  }

  // -------------------------------------------------------------------------------------------------------------
  // Shutdown
  // -------------------------------------------------------------------------------------------------------------
  async shutdown() {
    const logger = this.logger.for(this.shutdown.name);
    logger.info('Shutting down WebSocket Emitter...');

    await this.redisPub?.quit();

    logger.info('WebSocket Emitter shutdown complete');
  }
}
