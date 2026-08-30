import { BaseHelper } from '@/modules/base';
import { executePromiseWithLimit } from '@/utilities';
import { voidExecution } from '@/utilities/promise.utility';
import {
  IBunServer,
  IWebSocketClient,
  IWebSocketMessage,
  TWebSocketOutboundTransformer,
  WebSocketClientStates,
  WebSocketDefaults,
} from '../common';

export interface IWebSocketDeliveryHelperOptions<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  server: IBunServer;
  /** Shared by reference with WebSocketServerHelper - never copy, both sides must see the same live maps. */
  clients: Map<string, IWebSocketClient<MetadataType>>;
  users: Map<string, Set<string>>;
  rooms: Map<string, Set<string>>;
  outboundTransformer?: TWebSocketOutboundTransformer<unknown, MetadataType>;
  encryptedBatchLimit: number;
}

/** Local delivery and fan-out for the WebSocket server: single client, per-user, per-room, and broadcast. */
export class WebSocketDeliveryHelper<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> extends BaseHelper {
  private server: IBunServer;
  private clients: Map<string, IWebSocketClient<MetadataType>>;
  private users: Map<string, Set<string>>;
  private rooms: Map<string, Set<string>>;
  private outboundTransformer?: TWebSocketOutboundTransformer<unknown, MetadataType>;
  private encryptedBatchLimit: number;

  constructor(opts: IWebSocketDeliveryHelperOptions<MetadataType>) {
    super({ scope: WebSocketDeliveryHelper.name });

    this.server = opts.server;
    this.clients = opts.clients;
    this.users = opts.users;
    this.rooms = opts.rooms;
    this.outboundTransformer = opts.outboundTransformer;
    this.encryptedBatchLimit = opts.encryptedBatchLimit;
  }

  sendToClient(opts: { clientId: string; event: string; data: unknown; doLog?: boolean }) {
    const logger = this.logger.for(this.sendToClient.name);
    const { clientId, event, data, doLog } = opts;
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    // Async path - transformer intercepts before socket.send()
    const outboundTransformer = this.outboundTransformer;
    if (outboundTransformer && client.encrypted) {
      Promise.resolve()
        .then(() => outboundTransformer({ client, event, data }))
        .then(transformed => {
          const outboundMessage = transformed ?? { event, data };
          this.deliverToSocket({
            client,
            payload: JSON.stringify(outboundMessage),
            doLog,
            event,
            data,
          });
        })
        .catch(error => {
          logger.error('Outbound transformer error | id: %s | error: %s', clientId, error);
        });
      return;
    }

    // Sync path (unchanged, zero overhead when no transformer)
    this.deliverToSocket({ client, payload: JSON.stringify({ event, data }), doLog, event, data });
  }

  private async sendToClientAsync(opts: { clientId: string; event: string; data: unknown }) {
    const { clientId, event, data } = opts;
    const client = this.clients.get(clientId);
    if (!client) {
      return Promise.resolve();
    }

    if (!this.outboundTransformer || !client.encrypted) {
      this.deliverToSocket({ client, payload: JSON.stringify({ event, data }), event, data });
      return Promise.resolve();
    }

    try {
      const transformed = await Promise.resolve(this.outboundTransformer({ client, event, data }));
      const outboundMessage = transformed ?? { event, data };
      this.deliverToSocket({ client, payload: JSON.stringify(outboundMessage), event, data });
    } catch (error) {
      this.logger
        .for(this.sendToClientAsync.name)
        .error('Outbound transformer error | id: %s | error: %s', clientId, error);
    }
  }

  private deliverToSocket(opts: {
    client: IWebSocketClient<MetadataType>;
    payload: string;
    doLog?: boolean;
    event?: string;
    data?: unknown;
  }) {
    const logger = this.logger.for(this.deliverToSocket.name);
    const { client, payload, doLog, event, data } = opts;

    try {
      const result = client.socket.send(payload);

      if (result === 0) {
        logger.warn('Message dropped (socket closed) | id: %s', client.id);
      }

      if (result === -1) {
        client.backpressured = true;
        logger.warn('Backpressure detected | id: %s', client.id);
      }
    } catch (error) {
      logger.error('Failed to send | id: %s | error: %s', client.id, error);
    }

    if (doLog) {
      logger.info('Message sent | id: %s | event: %s | data: %j', client.id, event, data);
    }
  }

  sendToUser(opts: { userId: string; event: string; data: unknown }) {
    const { userId, event, data } = opts;
    const clientIds = this.users.get(userId);
    if (!clientIds) {
      return;
    }

    for (const clientId of clientIds) {
      this.sendToClient({ clientId, event, data });
    }
  }

  private sendToRoomExcluding(opts: {
    room: string;
    event: string;
    data: unknown;
    exclude: string[];
  }) {
    const { room, event, data, exclude } = opts;

    const excludeSet = new Set(exclude);
    const roomClientIds = this.rooms.get(room);
    if (!roomClientIds) {
      return;
    }

    // Serialised ONCE when there is no transformer, because the payload is then identical for every
    // recipient - `sendToClient` would otherwise run `JSON.stringify` per client on a message that
    // never differs. With a transformer each client's payload really is different, so that path
    // still goes through `sendToClient`. The non-excluding fan-out already works this way.
    if (!this.outboundTransformer) {
      const payload = JSON.stringify({ event, data });

      for (const clientId of roomClientIds) {
        if (excludeSet.has(clientId)) {
          continue;
        }

        const client = this.clients.get(clientId);
        if (client) {
          this.deliverToSocket({ client, payload, event, data });
        }
      }

      return;
    }

    for (const clientId of roomClientIds) {
      if (excludeSet.has(clientId)) {
        continue;
      }
      this.sendToClient({ clientId, event, data });
    }
  }

  sendToRoom(opts: { room: string; event: string; data: unknown; exclude?: string[] }) {
    const { room, event, data, exclude } = opts;

    // When exclude is present, must iterate - can't exclude from Bun native pub/sub
    if (exclude?.length) {
      this.sendToRoomExcluding({ room, event, data, exclude });
      return;
    }

    // No encryption - Bun native pub/sub O(1) C++ fan-out
    if (!this.outboundTransformer) {
      const payload = JSON.stringify({ event, data } satisfies IWebSocketMessage);
      this.server.publish(room, payload);
      return;
    }

    // Encryption enabled - iterate all clients individually with concurrency limit
    const roomClientIds = this.rooms.get(room);
    if (!roomClientIds) {
      return;
    }

    const tasks: Array<() => Promise<void>> = [];
    for (const clientId of roomClientIds) {
      tasks.push(() => this.sendToClientAsync({ clientId, event, data }));
    }

    if (tasks.length) {
      voidExecution({
        logger: this.logger,
        scope: this.sendToRoom.name,
        execution: executePromiseWithLimit({ tasks, limit: this.encryptedBatchLimit }),
      });
    }
  }

  private broadcastExcluding(opts: { event: string; data: unknown; exclude: string[] }) {
    const { event, data, exclude } = opts;

    const excludeSet = new Set(exclude);
    for (const [clientId, client] of this.clients) {
      if (excludeSet.has(clientId)) {
        continue;
      }
      // Only broadcast to authenticated clients (consistent with non-exclude path which uses BROADCAST_TOPIC)
      if (client.state !== WebSocketClientStates.AUTHENTICATED) {
        continue;
      }

      this.sendToClient({ clientId, event, data });
    }
  }

  broadcast(opts: { event: string; data: unknown; exclude?: string[] }) {
    const { event, data, exclude } = opts;

    // When exclude is present, must iterate - can't exclude from Bun native pub/sub
    if (exclude?.length) {
      this.broadcastExcluding({ event, data, exclude });
      return;
    }

    // No encryption - Bun native pub/sub O(1) C++ fan-out
    if (!this.outboundTransformer) {
      const payload = JSON.stringify({ event, data } satisfies IWebSocketMessage);
      this.server.publish(WebSocketDefaults.BROADCAST_TOPIC, payload);
      return;
    }

    // Encryption enabled - iterate all clients individually with concurrency limit
    const tasks: Array<() => Promise<void>> = [];
    for (const [clientId, client] of this.clients) {
      if (client.state !== WebSocketClientStates.AUTHENTICATED) {
        continue;
      }
      tasks.push(() => this.sendToClientAsync({ clientId, event, data }));
    }

    if (tasks.length) {
      voidExecution({
        logger: this.logger,
        scope: this.broadcast.name,
        execution: executePromiseWithLimit({ tasks, limit: this.encryptedBatchLimit }),
      });
    }
  }
}
