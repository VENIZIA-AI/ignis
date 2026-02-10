import {
  BaseApplication,
  BaseService,
  CoreBindings,
  inject,
  WebSocketBindingKeys,
  WebSocketServerHelper,
} from '@venizia/ignis';
import type { IWebSocketClient, IWebSocketMessage } from '@venizia/ignis-helpers';

export class WebSocketEventService extends BaseService {
  private _wsHelper: WebSocketServerHelper | null = null;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: WebSocketEventService.name });
  }

  // Lazy getter — WebSocketServerHelper is bound after server starts via post-start hook
  private get wsHelper(): WebSocketServerHelper {
    if (!this._wsHelper) {
      this._wsHelper =
        this.application.get<WebSocketServerHelper>({
          key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
          isOptional: true,
        }) ?? null;
    }

    if (!this._wsHelper) {
      throw new Error('[WebSocketEventService] WebSocket not initialized. Make sure server is started.');
    }

    return this._wsHelper;
  }

  // --------------------------------------------------------------------------------
  isReady(): boolean {
    return !!this.application.get<WebSocketServerHelper>({
      key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
      isOptional: true,
    });
  }

  // --------------------------------------------------------------------------------
  handleMessage(opts: { clientId: string; userId?: string; message: IWebSocketMessage }) {
    const logger = this.logger.for(this.handleMessage.name);
    const { clientId, userId, message } = opts;

    switch (message.event) {
      case 'echo': {
        // Echo back to sender
        this.wsHelper.sendToClient({
          clientId,
          event: 'echo:response',
          data: { original: message.data, timestamp: new Date().toISOString() },
        });
        break;
      }
      case 'chat:message': {
        const payload = message.data as { room?: string; message: string } | undefined;
        if (!payload?.message) {
          return;
        }

        const chatData = {
          from: clientId,
          userId,
          message: payload.message,
          timestamp: new Date().toISOString(),
        };

        if (payload.room) {
          // Send to specific room
          this.wsHelper.send({
            destination: payload.room,
            payload: { topic: 'chat:message', data: chatData },
            doLog: true,
          });
        } else {
          // Broadcast to all
          this.wsHelper.send({
            payload: { topic: 'chat:broadcast', data: chatData },
            doLog: true,
          });
        }
        break;
      }
      case 'get-clients': {
        const clients = this.wsHelper.getClients() as Map<string, IWebSocketClient>;
        const clientList = Array.from(clients.values()).map(c => ({
          id: c.id,
          userId: c.userId,
          rooms: Array.from(c.rooms),
          connectedAt: c.connectedAt,
        }));

        this.wsHelper.sendToClient({
          clientId,
          event: 'clients:list',
          data: { count: clientList.length, clients: clientList },
        });
        break;
      }
      default: {
        logger.warn('Unknown event | clientId: %s | event: %s', clientId, message.event);
        break;
      }
    }
  }

  // --------------------------------------------------------------------------------
  // Public API methods (called by REST controller)
  // --------------------------------------------------------------------------------
  broadcastMessage(opts: { topic: string; data: unknown }) {
    this.wsHelper.send({
      payload: { topic: opts.topic, data: opts.data },
      doLog: true,
    });
  }

  sendToRoom(opts: { room: string; topic: string; data: unknown }) {
    this.wsHelper.send({
      destination: opts.room,
      payload: { topic: opts.topic, data: opts.data },
      doLog: true,
    });
  }

  sendToClient(opts: { clientId: string; topic: string; data: unknown }) {
    this.wsHelper.send({
      destination: opts.clientId,
      payload: { topic: opts.topic, data: opts.data },
      doLog: true,
    });
  }

  sendToUser(opts: { userId: string; topic: string; data: unknown }) {
    const clients = this.wsHelper.getClientsByUser({ userId: opts.userId });
    for (const client of clients) {
      this.wsHelper.sendToClient({
        clientId: client.id,
        event: opts.topic,
        data: opts.data,
      });
    }
  }

  joinRoom(opts: { clientId: string; rooms: string[] }) {
    const { clientId, rooms } = opts;
    const client = this.wsHelper.getClients({ id: clientId }) as IWebSocketClient | undefined;
    if (!client) {
      return { success: false, message: `Client not found: ${clientId}` };
    }

    for (const room of rooms) {
      this.wsHelper.joinRoom({ clientId, room });
    }

    return { success: true, message: `Client ${clientId} joined rooms: ${rooms.join(', ')}` };
  }

  leaveRoom(opts: { clientId: string; rooms: string[] }) {
    const { clientId, rooms } = opts;
    const client = this.wsHelper.getClients({ id: clientId }) as IWebSocketClient | undefined;
    if (!client) {
      return { success: false, message: `Client not found: ${clientId}` };
    }

    for (const room of rooms) {
      this.wsHelper.leaveRoom({ clientId, room });
    }

    return { success: true, message: `Client ${clientId} left rooms: ${rooms.join(', ')}` };
  }

  getClientRooms(opts: { clientId: string }): { success: boolean; rooms?: string[]; message?: string } {
    const client = this.wsHelper.getClients({ id: opts.clientId }) as IWebSocketClient | undefined;
    if (!client) {
      return { success: false, message: `Client not found: ${opts.clientId}` };
    }
    return { success: true, rooms: Array.from(client.rooms) };
  }

  getConnectedClients(): Array<{ id: string; userId?: string; rooms: string[]; connectedAt: number }> {
    const clients = this.wsHelper.getClients() as Map<string, IWebSocketClient>;
    return Array.from(clients.values()).map(c => ({
      id: c.id,
      userId: c.userId,
      rooms: Array.from(c.rooms),
      connectedAt: c.connectedAt,
    }));
  }

  getClientCount(): number {
    const clients = this.wsHelper.getClients() as Map<string, IWebSocketClient>;
    return clients.size;
  }
}
