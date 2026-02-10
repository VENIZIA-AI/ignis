import { HTTP } from '@/common';
import { BaseHelper } from '@/helpers/base';
import { getError } from '@/helpers/error';
import { Cluster, Redis } from 'ioredis';
import {
  IBunServer,
  IBunWebSocketConfig,
  IBunWebSocketHandler,
  IWebSocket,
  IRedisSocketMessage,
  IWebSocketClient,
  IWebSocketMessage,
  IWebSocketServerOptions,
  TWebSocketAuthenticateFn,
  TWebSocketClientConnectedFn,
  TWebSocketClientDisconnectedFn,
  IWebSocketData,
  TWebSocketMessageHandler,
  TWebSocketValidateRoomFn,
  WebSocketChannels,
  WebSocketClientStates,
  WebSocketDefaults,
  WebSocketEvents,
  WebSocketMessageTypes,
} from '../common';

type TRedisClient = Redis | Cluster;

// -------------------------------------------------------------------------------------------------------------
export class WebSocketServerHelper extends BaseHelper {
  // --- Server ---
  private path: string;
  private server: IBunServer;

  // --- Connections ---
  private serverId: string;

  private clients: Map<string, IWebSocketClient> = new Map();
  private users: Map<string, Set<string>> = new Map(); // userId -> Set<clientId>
  private rooms: Map<string, Set<string>> = new Map(); // room -> Set<clientId>

  // --- Redis ---
  private redisPub: TRedisClient;
  private redisSub: TRedisClient;

  // --- Callbacks ---
  private authenticateFn: TWebSocketAuthenticateFn;
  private validateRoomFn?: TWebSocketValidateRoomFn;
  private onClientConnected?: TWebSocketClientConnectedFn;
  private onClientDisconnected?: TWebSocketClientDisconnectedFn;
  private messageHandler?: TWebSocketMessageHandler;

  // --- Options ---
  private defaultRooms: string[];
  private serverOptions: IBunWebSocketConfig;
  private authTimeout: number;
  private heartbeatInterval: number;
  private heartbeatTimeout: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // -------------------------------------------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------------------------------------------
  constructor(opts: IWebSocketServerOptions) {
    super({ scope: opts.identifier });

    this.identifier = opts.identifier;
    this.path = opts.path ?? WebSocketDefaults.PATH;
    this.server = opts.server;
    this.serverId = crypto.randomUUID();

    // Store callbacks
    this.authenticateFn = opts.authenticateFn;
    this.validateRoomFn = opts.validateRoomFn;
    this.onClientConnected = opts.clientConnectedFn;
    this.onClientDisconnected = opts.clientDisconnectedFn;
    this.messageHandler = opts.messageHandler;

    // Store options with defaults
    this.defaultRooms = opts.defaultRooms ?? [
      WebSocketDefaults.ROOM,
      WebSocketDefaults.NOTIFICATION_ROOM,
    ];
    this.serverOptions = {
      sendPings: WebSocketDefaults.SEND_PINGS,
      idleTimeout: WebSocketDefaults.IDLE_TIMEOUT,
      maxPayloadLength: WebSocketDefaults.MAX_PAYLOAD_LENGTH,
      ...opts.serverOptions,
    };
    this.authTimeout = opts.authTimeout ?? WebSocketDefaults.AUTH_TIMEOUT;
    this.heartbeatInterval = opts.heartbeatInterval ?? WebSocketDefaults.HEARTBEAT_INTERVAL;
    this.heartbeatTimeout = opts.heartbeatTimeout ?? WebSocketDefaults.HEARTBEAT_TIMEOUT;

    this.initRedisClients(opts.redisConnection);
  }

  private initRedisClients(redisConnection: IWebSocketServerOptions['redisConnection']) {
    if (!redisConnection) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[WebSocketServerHelper] Invalid redis connection!',
      });
    }

    const client = redisConnection.getClient();
    this.redisPub = client.duplicate();
    this.redisSub = client.duplicate();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Public Accessors
  // -------------------------------------------------------------------------------------------------------------
  getClients(opts?: { id?: string }): IWebSocketClient | Map<string, IWebSocketClient> | undefined {
    const { id } = opts ?? {};
    if (id) {
      return this.clients.get(id);
    }
    return this.clients;
  }

  getClientsByUser(opts: { userId: string }): IWebSocketClient[] {
    const clientIds = this.users.get(opts.userId);
    if (!clientIds) {
      return [];
    }

    const clients: IWebSocketClient[] = [];
    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client) {
        clients.push(client);
      }
    }
    return clients;
  }

  getClientsByRoom(opts: { room: string }): IWebSocketClient[] {
    const clientIds = this.rooms.get(opts.room);
    if (!clientIds) {
      return [];
    }

    const clients: IWebSocketClient[] = [];
    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client) {
        clients.push(client);
      }
    }
    return clients;
  }

  getPath(): string {
    return this.path;
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
    logger.info('Configuring WebSocket Server | id: %s', this.identifier);

    // Register error handlers before awaiting readiness
    this.redisPub.on('error', (error: Error) => {
      logger.error('Redis pub error | error: %j', error);
    });
    this.redisSub.on('error', (error: Error) => {
      logger.error('Redis sub error | error: %j', error);
    });

    // Ensure duplicated clients connect (they inherit lazyConnect from parent)
    for (const client of [this.redisPub, this.redisSub]) {
      if (client.status === 'wait') {
        client.connect();
      }
    }

    // Wait for all Redis connections to be ready
    await Promise.all([
      this.waitForRedisReady(this.redisPub),
      this.waitForRedisReady(this.redisSub),
    ]);
    logger.info('All Redis connections ready');

    // Setup Redis subscriptions for cross-instance messaging
    await this.setupRedisSubscriptions();

    this.startHeartbeatTimer();

    logger.info('WebSocket Server READY | path: %s', this.path);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Redis Pub/Sub
  // -------------------------------------------------------------------------------------------------------------
  private async setupRedisSubscriptions() {
    const logger = this.logger.for(this.setupRedisSubscriptions.name);

    // Subscribe to all channels — await to ensure subscriptions are active before proceeding
    await Promise.all([
      this.redisSub.subscribe(WebSocketChannels.BROADCAST),
      this.redisSub.psubscribe(WebSocketChannels.forRoomPattern()),
      this.redisSub.psubscribe(WebSocketChannels.forClientPattern()),
      this.redisSub.psubscribe(WebSocketChannels.forUserPattern()),
    ]);

    // Handle direct subscribe messages
    this.redisSub.on('message', (channel: string, raw: string) => {
      this.onRedisMessage({ channel, raw });
    });

    // Handle pattern subscribe messages
    this.redisSub.on('pmessage', (_pattern: string, channel: string, raw: string) => {
      this.onRedisMessage({ channel, raw });
    });

    logger.info('Redis subscriptions configured');
  }

  private onRedisMessage(opts: { channel: string; raw: string }) {
    const logger = this.logger.for(this.onRedisMessage.name);
    const { channel, raw } = opts;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.error('Failed to parse Redis message | channel: %s', channel);
      return;
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as IRedisSocketMessage).serverId !== 'string' ||
      typeof (parsed as IRedisSocketMessage).event !== 'string'
    ) {
      logger.error('Invalid Redis message shape | channel: %s', channel);
      return;
    }

    const message = parsed as IRedisSocketMessage;

    // Skip messages from this server instance (dedup)
    if (message.serverId === this.serverId) {
      return;
    }

    const { type, target, event, data, exclude } = message;

    // Route by message type
    switch (type) {
      case WebSocketMessageTypes.BROADCAST: {
        this.broadcast({ event, data, exclude });
        break;
      }
      case WebSocketMessageTypes.ROOM: {
        if (target) {
          this.sendToRoom({ room: target, event, data, exclude });
        }
        break;
      }
      case WebSocketMessageTypes.CLIENT: {
        if (target) {
          this.sendToClient({ clientId: target, event, data });
        }
        break;
      }
      case WebSocketMessageTypes.USER: {
        if (target) {
          this.sendToUser({ userId: target, event, data });
        }
        break;
      }
      default: {
        break;
      }
    }
  }

  private publishToRedis(opts: {
    type: IRedisSocketMessage['type'];
    target?: string;
    event: string;
    data: unknown;
    exclude?: string[];
  }) {
    const { type, target, event, data, exclude } = opts;

    const message: IRedisSocketMessage = {
      serverId: this.serverId,
      type,
      target,
      event,
      data,
      exclude,
    };

    let channel: string;
    switch (type) {
      case WebSocketMessageTypes.BROADCAST: {
        channel = WebSocketChannels.BROADCAST;
        break;
      }
      case WebSocketMessageTypes.ROOM: {
        channel = WebSocketChannels.forRoom({ room: target! });
        break;
      }
      case WebSocketMessageTypes.CLIENT: {
        channel = WebSocketChannels.forClient({ clientId: target! });
        break;
      }
      case WebSocketMessageTypes.USER: {
        channel = WebSocketChannels.forUser({ userId: target! });
        break;
      }
      default: {
        return;
      }
    }

    this.redisPub.publish(channel, JSON.stringify(message));
  }

  // -------------------------------------------------------------------------------------------------------------
  // Bun WebSocket Handler
  // -------------------------------------------------------------------------------------------------------------
  getBunWebSocketHandler(): IBunWebSocketHandler {
    const config = this.serverOptions;

    return {
      open: (socket: IWebSocket) => {
        const { clientId } = socket.data as IWebSocketData;
        this.onClientConnect({ clientId, socket });
      },
      message: (socket: IWebSocket, message: string | Buffer) => {
        const { clientId } = socket.data as IWebSocketData;
        const client = this.clients.get(clientId);

        if (client) {
          client.lastActivity = Date.now();
        }

        this.onClientMessage({
          clientId,
          raw: typeof message === 'string' ? message : message.toString(),
        });
      },
      close: (socket: IWebSocket) => {
        const { clientId } = socket.data as IWebSocketData;
        this.onClientDisconnect({ clientId });
      },
      drain: (socket: IWebSocket) => {
        const { clientId } = socket.data as IWebSocketData;
        const client = this.clients.get(clientId);
        if (client) {
          client.backpressured = false;
          this.logger.for('drain').debug('Backpressure cleared | id: %s', clientId);
        }
      },
      // Spread Bun native config
      perMessageDeflate: config.perMessageDeflate,
      maxPayloadLength: config.maxPayloadLength,
      idleTimeout: config.idleTimeout,
      backpressureLimit: config.backpressureLimit,
      closeOnBackpressureLimit: config.closeOnBackpressureLimit,
      sendPings: config.sendPings,
      publishToSelf: config.publishToSelf,
    };
  }

  // -------------------------------------------------------------------------------------------------------------
  // Connection Lifecycle
  // -------------------------------------------------------------------------------------------------------------
  onClientConnect(opts: { clientId: string; socket: IWebSocket }) {
    const logger = this.logger.for(this.onClientConnect.name);
    const { clientId, socket } = opts;

    if (this.clients.has(clientId)) {
      logger.info('Client already existed | id: %s', clientId);
      return;
    }

    logger.info('New connection (unauthorized) | id: %s', clientId);

    const now = Date.now();

    // Create client entry — unauthorized until authenticate event
    const client: IWebSocketClient = {
      id: clientId,
      socket,
      state: WebSocketClientStates.UNAUTHORIZED,
      rooms: new Set(),
      backpressured: false,
      connectedAt: now,
      lastActivity: now,
    };
    this.clients.set(clientId, client);

    // Auto-join client's own room (same as Socket.IO: socket.id room)
    socket.subscribe(clientId);

    // Start auth timeout — disconnect if not authenticated in time
    client.authTimer = setTimeout(() => {
      const c = this.clients.get(clientId);
      if (c?.state === WebSocketClientStates.UNAUTHORIZED) {
        logger.warn('Auth timeout | id: %s', clientId);
        c.socket.close(4001, 'Authentication timeout');
      }
    }, this.authTimeout);
  }

  onClientMessage(opts: { clientId: string; raw: string }) {
    const logger = this.logger.for(this.onClientMessage.name);
    const { clientId, raw } = opts;

    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    let message: IWebSocketMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      this.sendToClient({
        clientId,
        event: WebSocketEvents.ERROR,
        data: { message: 'Invalid message format' },
      });
      return;
    }

    if (!message.event) {
      logger.error('Invalid message payload | Missing event | raw: %s', raw);
      return;
    }

    if (message.event === WebSocketEvents.HEARTBEAT) {
      return;
    }

    if (message.event === WebSocketEvents.AUTHENTICATE) {
      this.handleAuthenticate({ clientId, payload: message.data ?? {} });
      return;
    }

    if (client.state !== WebSocketClientStates.AUTHENTICATED) {
      this.sendToClient({
        clientId,
        event: WebSocketEvents.ERROR,
        data: { message: 'Not authenticated' },
      });
      return;
    }

    switch (message.event) {
      case WebSocketEvents.JOIN: {
        this.handleJoin({ clientId, payload: message.data });
        break;
      }
      case WebSocketEvents.LEAVE: {
        this.handleLeave({ clientId, payload: message.data });
        break;
      }
      default: {
        if (!this.messageHandler) {
          logger.debug('No messageHandler for extra event | raw: %s', raw);
          break;
        }

        Promise.resolve(
          this.messageHandler({
            clientId,
            userId: client.userId,
            message,
          }),
        ).catch(error => {
          logger.error('Message handler error | id: %s | error: %s', clientId, error);
        });
        break;
      }
    }
  }

  onClientDisconnect(opts: { clientId: string }) {
    const logger = this.logger.for(this.onClientDisconnect.name);
    const { clientId } = opts;

    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    // Clear auth timeout if still pending
    if (client.authTimer) {
      clearTimeout(client.authTimer);
      client.authTimer = undefined;
    }

    // Remove from user index
    if (client.userId) {
      const userClients = this.users.get(client.userId);
      userClients?.delete(clientId);
      if (userClients?.size === 0) {
        this.users.delete(client.userId);
      }
    }

    // Remove from all rooms
    for (const room of client.rooms) {
      const roomClients = this.rooms.get(room);
      roomClients?.delete(clientId);
      if (roomClients?.size === 0) {
        this.rooms.delete(room);
      }
    }

    // Remove client
    this.clients.delete(clientId);

    logger.info(
      'Client disconnected | id: %s | userId: %s',
      clientId,
      client.userId ?? 'anonymous',
    );

    // Invoke user callback
    Promise.resolve(this.onClientDisconnected?.({ clientId, userId: client.userId })).catch(
      error => {
        this.logger.for('clientDisconnectedFn').error('Handler error | error: %s', error);
      },
    );
  }

  // -------------------------------------------------------------------------------------------------------------
  // Room Management
  // -------------------------------------------------------------------------------------------------------------
  joinRoom(opts: { clientId: string; room: string }) {
    const { clientId, room } = opts;
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    // Track in roomIndex
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set<string>());
    }
    this.rooms.get(room)!.add(clientId);
    client.rooms.add(room);

    // Bun native pub/sub
    client.socket.subscribe(room);
  }

  leaveRoom(opts: { clientId: string; room: string }) {
    const { clientId, room } = opts;
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    // Remove from roomIndex
    const roomClients = this.rooms.get(room);
    roomClients?.delete(clientId);
    if (roomClients?.size === 0) {
      this.rooms.delete(room);
    }

    client.rooms.delete(room);

    // Bun native pub/sub
    client.socket.unsubscribe(room);
  }

  private handleAuthenticate(opts: { clientId: string; payload: unknown }) {
    const logger = this.logger.for('handleAuthenticate');
    const { clientId, payload } = opts;

    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    if (client.state !== WebSocketClientStates.UNAUTHORIZED) {
      this.sendToClient({
        clientId,
        event: WebSocketEvents.ERROR,
        data: { message: 'Already authenticated' },
      });
      return;
    }

    client.state = WebSocketClientStates.AUTHENTICATING;

    // Clear auth timeout — authentication is in progress
    if (client.authTimer) {
      clearTimeout(client.authTimer);
      client.authTimer = undefined;
    }

    Promise.resolve()
      .then(() => this.authenticateFn((payload ?? {}) as Record<string, unknown>))
      .then(result => {
        if (!result) {
          logger.info('Authentication rejected | id: %s', clientId);
          this.sendToClient({
            clientId,
            event: WebSocketEvents.ERROR,
            data: { message: 'Authentication failed' },
          });
          client.socket.close(4003, 'Authentication failed');
          return;
        }

        // Update client with auth result
        client.userId = result.userId;
        client.metadata = result.metadata;
        client.state = WebSocketClientStates.AUTHENTICATED;

        // Index by userId
        if (client.userId) {
          if (!this.users.has(client.userId)) {
            this.users.set(client.userId, new Set<string>());
          }
          this.users.get(client.userId)!.add(clientId);
        }

        // Subscribe to broadcast topic
        client.socket.subscribe(WebSocketDefaults.BROADCAST_TOPIC);

        // Join default rooms
        this.joinRoom({ clientId, room: clientId });
        for (const room of this.defaultRooms) {
          this.joinRoom({ clientId, room });
        }

        // Notify client of successful authentication
        this.sendToClient({
          clientId,
          event: WebSocketEvents.CONNECTED,
          data: {
            id: clientId,
            userId: client.userId,
            time: new Date().toISOString(),
          },
        });

        logger.info('Authenticated | id: %s | userId: %s', clientId, client.userId ?? 'anonymous');

        // Invoke user callback
        Promise.resolve(
          this.onClientConnected?.({
            clientId,
            userId: client.userId,
            metadata: client.metadata,
          }),
        ).catch(error => {
          this.logger.for('clientConnectedFn').error('Handler error | error: %s', error);
        });
      })
      .catch(error => {
        logger.error('Authentication error | id: %s | error: %s', clientId, error);
        this.sendToClient({
          clientId,
          event: WebSocketEvents.ERROR,
          data: { message: 'Authentication error' },
        });
        client.socket.close(4003, 'Authentication failed');
      });
  }

  private handleJoin(opts: { clientId: string; payload: unknown }) {
    const logger = this.logger.for('handleJoin');
    const { clientId, payload } = opts;
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    const { rooms = [] } = (payload as { rooms?: string[] }) || {};
    if (!rooms?.length) {
      return;
    }

    // Reject rooms with internal prefixes or invalid names
    const INTERNAL_PREFIX = 'ws:';
    const MAX_ROOM_NAME_LENGTH = 256;
    const sanitizedRooms = rooms.filter(r => {
      return (
        typeof r === 'string' &&
        r.length > 0 &&
        r.length <= MAX_ROOM_NAME_LENGTH &&
        !r.startsWith(INTERNAL_PREFIX)
      );
    });

    if (!sanitizedRooms.length) {
      logger.warn(
        'Join rejected | id: %s | rooms: %j | reason: all rooms filtered out',
        clientId,
        rooms,
      );
      return;
    }

    if (!this.validateRoomFn) {
      logger.warn(
        'Join rejected | id: %s | rooms: %j | reason: no validateRoomFn configured',
        clientId,
        sanitizedRooms,
      );
      return;
    }

    Promise.resolve(this.validateRoomFn({ clientId, userId: client.userId, rooms: sanitizedRooms }))
      .then((allowedRooms: string[]) => {
        if (!allowedRooms?.length) {
          logger.warn(
            'Join rejected | id: %s | rooms: %j | reason: no rooms allowed',
            clientId,
            sanitizedRooms,
          );
          return;
        }

        for (const room of allowedRooms) {
          this.joinRoom({ clientId, room });
        }

        logger.info('Joined rooms | id: %s | rooms: %j', clientId, allowedRooms);
      })
      .catch(error => {
        logger.error(
          'Failed to join rooms | id: %s | rooms: %j | error: %s',
          clientId,
          sanitizedRooms,
          error,
        );
      });
  }

  private handleLeave(opts: { clientId: string; payload: unknown }) {
    const logger = this.logger.for('handleLeave');
    const { clientId, payload } = opts;

    const { rooms = [] } = (payload as { rooms?: string[] }) || {};
    if (!rooms?.length) {
      return;
    }

    logger.info('Leaving rooms | id: %s | rooms: %j', clientId, rooms);

    for (const room of rooms) {
      this.leaveRoom({ clientId, room });
    }

    logger.info('Left rooms | id: %s | rooms: %j', clientId, rooms);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Messaging — Local Delivery
  // -------------------------------------------------------------------------------------------------------------
  sendToClient(opts: { clientId: string; event: string; data: unknown; doLog?: boolean }) {
    const logger = this.logger.for(this.sendToClient.name);
    const { clientId, event, data, doLog } = opts;
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    const payload = JSON.stringify({ event, data });

    try {
      const result = client.socket.send(payload);

      if (result === 0) {
        logger.warn('Message dropped (socket closed) | id: %s', clientId);
      }

      if (result === -1) {
        client.backpressured = true;
        logger.warn('Backpressure detected | id: %s', clientId);
      }
    } catch (error) {
      logger.error('Failed to send | id: %s | error: %s', clientId, error);
    }

    if (doLog) {
      logger.info('Message sent | id: %s | event: %s | data: %j', clientId, event, data);
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

  sendToRoom(opts: { room: string; event: string; data: unknown; exclude?: string[] }) {
    const { room, event, data, exclude } = opts;

    const payload = JSON.stringify({ event, data } satisfies IWebSocketMessage);

    // Fast path: Bun native pub/sub — O(1) topic lookup, C++ fan-out
    if (!exclude?.length) {
      this.server.publish(room, payload);
      return;
    }

    // Slow path: iterate room members, skip excluded clients
    const excludeSet = new Set(exclude);
    const roomClientIds = this.rooms.get(room);
    if (!roomClientIds) {
      return;
    }

    for (const clientId of roomClientIds) {
      if (excludeSet.has(clientId)) {
        continue;
      }
      this.sendToClient({ clientId, event, data });
    }
  }

  broadcast(opts: { event: string; data: unknown; exclude?: string[] }) {
    const { event, data, exclude } = opts;

    // Fast path: Bun native pub/sub via broadcast topic — O(1) C++ fan-out
    if (!exclude?.length) {
      const payload = JSON.stringify({ event, data } satisfies IWebSocketMessage);
      this.server.publish(WebSocketDefaults.BROADCAST_TOPIC, payload);
      return;
    }

    // Slow path: iterate with exclusion
    const excludeSet = new Set(exclude);
    for (const [clientId] of this.clients) {
      if (excludeSet.has(clientId)) {
        continue;
      }
      this.sendToClient({ clientId, event, data });
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Messaging — Public API (local + Redis)
  // -------------------------------------------------------------------------------------------------------------
  send<T = unknown>(opts: {
    destination?: string;
    payload: { topic: string; data: T };
    doLog?: boolean;
    cb?: () => void;
  }) {
    const logger = this.logger.for(this.send.name);
    const { destination, payload, doLog, cb } = opts;

    if (!payload) {
      return;
    }

    const { topic, data } = payload;
    if (!topic || data === undefined) {
      return;
    }

    // Broadcast — send to all local + publish to Redis
    if (!destination) {
      this.broadcast({ event: topic, data });
      this.publishToRedis({ type: WebSocketMessageTypes.BROADCAST, event: topic, data });
    } else if (this.clients.has(destination)) {
      // Local client — send directly + publish to Redis
      this.sendToClient({ clientId: destination, event: topic, data, doLog });
      this.publishToRedis({
        type: WebSocketMessageTypes.CLIENT,
        target: destination,
        event: topic,
        data,
      });
    } else if (this.rooms.has(destination)) {
      // Room — fan-out locally + publish to Redis
      this.sendToRoom({ room: destination, event: topic, data });
      this.publishToRedis({
        type: WebSocketMessageTypes.ROOM,
        target: destination,
        event: topic,
        data,
      });
    } else {
      // Could be a client or room on another instance — publish to Redis
      this.publishToRedis({
        type: WebSocketMessageTypes.ROOM,
        target: destination,
        event: topic,
        data,
      });
    }

    if (cb) {
      setTimeout(cb, 0);
    }

    if (doLog) {
      logger.info(
        'Message emitted | destination: %s | topic: %s | data: %j',
        destination ?? 'all',
        topic,
        data,
      );
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------------------------------------------
  private startHeartbeatTimer() {
    this.heartbeatTimer = setInterval(() => {
      this.heartbeatAll();
    }, this.heartbeatInterval);
  }

  private heartbeatAll() {
    const now = Date.now();
    const timeout = this.heartbeatTimeout;

    // Sweep stale authenticated clients
    for (const [clientId, client] of this.clients) {
      if (client.state !== WebSocketClientStates.AUTHENTICATED) {
        continue; // Auth timeout handles unauthorized clients separately
      }

      if (now - client.lastActivity <= timeout) {
        continue;
      }

      this.logger
        .for(this.heartbeatAll.name)
        .warn(
          'Heartbeat timeout | id: %s | lastActivity: %s',
          clientId,
          new Date(client.lastActivity).toISOString(),
        );

      client.socket.close(4002, 'Heartbeat timeout');
      // Bun fires close handler → onClientDisconnect handles cleanup
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Shutdown
  // -------------------------------------------------------------------------------------------------------------
  async shutdown() {
    const logger = this.logger.for(this.shutdown.name);
    logger.info('Shutting down WebSocket server...');

    // Clear heartbeat timer
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Disconnect all clients
    for (const [clientId, client] of this.clients) {
      try {
        client.socket.close(1001, 'Server shutting down');
      } catch (_error) {
        logger.error('Client may already be disconnected | clientId: %s', clientId);
      }
    }

    this.clients.clear();
    this.users.clear();
    this.rooms.clear();

    // Cleanup Redis connections
    await Promise.all([this.redisPub?.quit(), this.redisSub?.quit()]);

    logger.info('WebSocket server shutdown complete');
  }
}
