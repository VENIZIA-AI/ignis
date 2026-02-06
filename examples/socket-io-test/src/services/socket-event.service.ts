import {
  BaseApplication,
  BaseService,
  CoreBindings,
  inject,
  SocketIOBindingKeys,
  SocketIOServerHelper,
} from '@venizia/ignis';
import { ISocketIOClient } from '@venizia/ignis-helpers';
import { Socket } from 'socket.io';

export class SocketEventService extends BaseService {
  private _socketIOHelper: SocketIOServerHelper | null = null;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE })
    private application: BaseApplication,
  ) {
    super({ scope: SocketEventService.name });
  }

  // Lazy getter — SocketIOHelper is bound after server starts via post-start hook
  private get socketIOHelper(): SocketIOServerHelper {
    if (!this._socketIOHelper) {
      this._socketIOHelper =
        this.application.get<SocketIOServerHelper>({
          key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
          isOptional: true,
        }) ?? null;
    }

    if (!this._socketIOHelper) {
      throw new Error('[SocketEventService] SocketIO not initialized. Make sure server is started.');
    }

    return this._socketIOHelper;
  }

  // --------------------------------------------------------------------------------
  isReady(): boolean {
    return !!this.application.get<SocketIOServerHelper>({
      key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
      isOptional: true,
    });
  }

  // --------------------------------------------------------------------------------
  registerClientHandlers(opts: { socket: Socket }) {
    const logger = this.logger.for(this.registerClientHandlers.name);
    const { socket } = opts;

    // Chat message — send to room or broadcast
    socket.on('chat:message', (data: { room?: string; message: string }) => {
      logger.info('Received chat message | socketId: %s | data: %j', socket.id, data);

      const payload = {
        topic: data.room ? 'chat:message' : 'chat:broadcast',
        data: {
          from: socket.id,
          message: data.message,
          timestamp: new Date().toISOString(),
        },
      };

      this.socketIOHelper.send({
        destination: data.room,
        payload,
        doLog: true,
      });
    });

    // Echo — for testing
    socket.on('echo', (data: unknown) => {
      logger.info('Echo request | socketId: %s | data: %j', socket.id, data);

      this.socketIOHelper.send({
        destination: socket.id,
        payload: {
          topic: 'echo:response',
          data: { original: data, timestamp: new Date().toISOString() },
        },
      });
    });

    // Get connected clients list — for testing
    socket.on('get-clients', () => {
      logger.info('Get clients request | socketId: %s', socket.id);

      const clients = this.socketIOHelper.getClients() as Map<string, ISocketIOClient>;
      const clientIds = Array.from(clients.keys());

      this.socketIOHelper.send({
        destination: socket.id,
        payload: {
          topic: 'clients:list',
          data: { count: clientIds.length, clients: clientIds },
        },
      });
    });

    logger.info('Client handlers registered | socketId: %s', socket.id);
  }

  // --------------------------------------------------------------------------------
  broadcastMessage(opts: { topic: string; data: unknown }) {
    this.socketIOHelper.send({
      payload: { topic: opts.topic, data: opts.data },
      doLog: true,
    });
  }

  // --------------------------------------------------------------------------------
  sendToRoom(opts: { room: string; topic: string; data: unknown }) {
    this.socketIOHelper.send({
      destination: opts.room,
      payload: { topic: opts.topic, data: opts.data },
      doLog: true,
    });
  }

  // --------------------------------------------------------------------------------
  sendToClient(opts: { clientId: string; topic: string; data: unknown }) {
    this.socketIOHelper.send({
      destination: opts.clientId,
      payload: { topic: opts.topic, data: opts.data },
      doLog: true,
    });
  }

  // --------------------------------------------------------------------------------
  joinRoom(opts: { clientId: string; rooms: string[] }) {
    const logger = this.logger.for(this.joinRoom.name);
    const { clientId, rooms } = opts;

    const client = this.socketIOHelper.getClients({ id: clientId }) as ISocketIOClient | undefined;
    if (!client) {
      logger.warn('Client not found | clientId: %s', clientId);
      return { success: false, message: `Client not found: ${clientId}` };
    }

    client.socket.join(rooms);
    logger.info('Client joined rooms | clientId: %s | rooms: %j', clientId, rooms);
    return { success: true, message: `Client ${clientId} joined rooms: ${rooms.join(', ')}` };
  }

  // --------------------------------------------------------------------------------
  leaveRoom(opts: { clientId: string; rooms: string[] }) {
    const logger = this.logger.for(this.leaveRoom.name);
    const { clientId, rooms } = opts;

    const client = this.socketIOHelper.getClients({ id: clientId }) as ISocketIOClient | undefined;
    if (!client) {
      logger.warn('Client not found | clientId: %s', clientId);
      return { success: false, message: `Client not found: ${clientId}` };
    }

    for (const room of rooms) {
      client.socket.leave(room);
    }

    logger.info('Client left rooms | clientId: %s | rooms: %j', clientId, rooms);
    return { success: true, message: `Client ${clientId} left rooms: ${rooms.join(', ')}` };
  }

  // --------------------------------------------------------------------------------
  getClientRooms(opts: { clientId: string }): { success: boolean; rooms?: string[]; message?: string } {
    const { clientId } = opts;

    const client = this.socketIOHelper.getClients({ id: clientId }) as ISocketIOClient | undefined;
    if (!client) {
      return { success: false, message: `Client not found: ${clientId}` };
    }

    const rooms = Array.from(client.socket.rooms);
    return { success: true, rooms };
  }

  // --------------------------------------------------------------------------------
  getConnectedClients(): string[] {
    const clients = this.socketIOHelper.getClients() as Map<string, ISocketIOClient>;
    return Array.from(clients.keys());
  }

  // --------------------------------------------------------------------------------
  getClientCount(): number {
    const clients = this.socketIOHelper.getClients() as Map<string, ISocketIOClient>;
    return clients.size;
  }
}
