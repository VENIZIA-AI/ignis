import { ApplicationLogger, LoggerFactory } from '@/helpers/logger';
import { DefaultRedisHelper } from '@/helpers/redis';
import { getError } from '@/helpers/error';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import isEmpty from 'lodash/isEmpty';
import { Server as HTTPServer } from 'node:http';
import { Server as IOServer, Socket as IOSocket, ServerOptions } from 'socket.io';
import { SocketIOConstants } from './constants';
import { IHandshake, ISocketIOServerOptions } from './types';
import { validateModule } from '@/utilities/module.utility';

const CLIENT_AUTHENTICATE_TIMEOUT = 10_000;

// -------------------------------------------------------------------------------------------------------------
export class SocketIOServerHelper {
  private logger: ApplicationLogger;

  private identifier: string;
  private server: HTTPServer;
  private serverOptions: Partial<ServerOptions> = {};

  private redisConnection: DefaultRedisHelper;

  private authenticateFn: (args: IHandshake) => Promise<boolean>;
  private onClientConnected: (opts: { socket: IOSocket }) => Promise<void>;

  private authenticateTimeout: number;
  private defaultRooms: string[];

  private io: IOServer;
  private emitter: Emitter;

  private clients: Record<
    string,
    {
      id: string;
      socket: IOSocket;
      state: 'unauthorized' | 'authenticating' | 'authenticated';
      interval?: NodeJS.Timeout;
      authenticateTimeout: NodeJS.Timeout;
    }
  >;

  constructor(opts: ISocketIOServerOptions) {
    this.logger = LoggerFactory.getLogger([SocketIOServerHelper.name]);
    this.clients = {};

    this.identifier = opts.identifier;
    this.serverOptions = opts?.serverOptions ?? {};

    this.redisConnection = opts.redisConnection;

    this.authenticateFn = opts.authenticateFn;
    this.onClientConnected = opts.clientConnectedFn;
    this.authenticateTimeout = opts.authenticateTimeout ?? CLIENT_AUTHENTICATE_TIMEOUT;
    this.defaultRooms = opts.defaultRooms ?? [
      SocketIOConstants.ROOM_DEFAULT,
      SocketIOConstants.ROOM_NOTIFICATION,
    ];

    if (!opts.server) {
      throw getError({
        statusCode: 500,
        message:
          '[SocketIOServerHelper] Invalid server and lb-application to initialize io-socket server!',
      });
    }

    this.server = opts.server;

    // Establish redis connection
    if (!this.redisConnection) {
      throw getError({
        statusCode: 500,
        message: 'Invalid redis connection to config socket.io adapter!',
      });
    }

    this.configure();
  }

  // -------------------------------------------------------------------------------------------------------------
  getIOServer(): IOServer {
    return this.io;
  }

  // -------------------------------------------------------------------------------------------------------------
  getClients(opts?: { id: string }) {
    if (opts?.id) {
      return this.clients[opts.id];
    }

    return this.clients;
  }

  // -------------------------------------------------------------------------------------------------------------
  on(opts: { topic: string; handler: (...args: any) => Promise<void> }) {
    const { topic, handler } = opts;
    if (!topic || !handler) {
      throw getError({ message: '[on] Invalid topic or event handler!' });
    }

    if (!this.io) {
      throw getError({ message: '[on] IOServer is not initialized yet!' });
    }

    this.io.on(topic, handler);
  }

  // -------------------------------------------------------------------------------------------------------------
  configure() {
    validateModule({
      scope: SocketIOServerHelper.name,
      modules: ['@socket.io/redis-adapter', '@socket.io/redis-emitter', 'socket.io'],
    });
    this.logger.info('[configure][%s] Configuring IO Server', this.identifier);

    if (!this.server) {
      throw getError({
        statusCode: 500,
        message: '[DANGER] Invalid server instance to init Socket.io server!',
      });
    }

    this.io = new IOServer(this.server, this.serverOptions);

    // Config socket.io redis adapter
    this.io.adapter(
      createAdapter(
        this.redisConnection.getClient().duplicate(), // Redis PUB Client
        this.redisConnection.getClient().duplicate(), // Redis SUB Client
      ),
    );
    this.logger.info('[configure] SocketIO Server initialized Redis Adapter');

    // Config socket.io redis emitter
    this.emitter = new Emitter(
      this.redisConnection.getClient().duplicate(), // Redis EMITTER Client
    );
    this.emitter.redisClient.on('error', (error: Error) => {
      this.logger.error('[configure][Emitter] On Error: %j', error);
    });
    this.logger.info('[configure] SocketIO Server initialized Redis Emitter!');

    // Handle socket.io new connection
    this.io.on(SocketIOConstants.EVENT_CONNECT, (socket: IOSocket) => {
      this.onClientConnect({ socket });
    });

    this.logger.info(
      '[configure] SocketIO Server READY | Path: %s | Address: %j',
      this.serverOptions?.path ?? '',
      this.server?.address(),
    );
    this.logger.debug('[configure] Whether http listening: %s', this.server?.listening);
  }

  // -------------------------------------------------------------------------------------------------------------
  onClientConnect(opts: { socket: IOSocket }) {
    const { socket } = opts;
    if (!socket) {
      this.logger.info('[onClientConnect] Invalid new socket connection!');
      return;
    }

    // Validate user identifier
    const { id, handshake } = socket;
    const { headers } = handshake;
    if (this.clients[id]) {
      this.logger.info('[onClientConnect] Socket client already existed: %j', {
        id,
        headers,
      });
      return;
    }

    this.logger.info('[onClientConnect] New connection request with options: %j', { id, headers });
    this.clients[id] = {
      id,
      socket,
      state: 'unauthorized',
      authenticateTimeout: setTimeout(() => {
        if (this.clients[id]?.state === 'authenticated') {
          return;
        }

        this.disconnect({ socket });
      }, this.authenticateTimeout),
    };

    socket.on(SocketIOConstants.EVENT_AUTHENTICATE, () => {
      this.clients[id].state = 'authenticating';
      this.authenticateFn(handshake)
        .then(rs => {
          this.logger.info('[onClientAuthenticate] Socket: %s | Authenticate result: %s', id, rs);

          // Valid connection
          if (rs) {
            this.onClientAuthenticated({ socket });
            return;
          }

          // Invalid connection
          this.clients[id].state = 'unauthorized';
          this.send({
            destination: socket.id,
            payload: {
              topic: SocketIOConstants.EVENT_UNAUTHENTICATE,
              data: {
                message: 'Invalid token token authenticate! Please login again!',
                time: new Date().toISOString(),
              },
            },
            cb: () => {
              this.disconnect({ socket });
            },
          });
        })
        .catch(error => {
          // Unexpected error while authenticating connection
          this.clients[id].state = 'unauthorized';
          this.logger.error(
            '[onClientConnect] Connection: %s | Failed to authenticate new socket connection | Error: %s',
            id,
            error,
          );

          this.send({
            destination: socket.id,
            payload: {
              topic: SocketIOConstants.EVENT_UNAUTHENTICATE,
              data: {
                message: 'Failed to authenticate connection! Please login again!',
                time: new Date().toISOString(),
              },
            },
            doLog: true,
            cb: () => {
              this.disconnect({ socket });
            },
          });
        });
    });
  }

  // -------------------------------------------------------------------------------------------------------------
  onClientAuthenticated(opts: { socket: IOSocket }) {
    const { socket } = opts;
    if (!socket) {
      this.logger.info('[onClientAuthenticated] Invalid new socket connection!');
      return;
    }

    // Validate user identifier
    const { id } = socket;
    if (!this.clients[id]) {
      this.logger.info('[onClientAuthenticated] Unknown client id %s to continue!', id);
      this.disconnect({ socket });
      return;
    }
    this.clients[id].state = 'authenticated';
    this.ping({ socket, doIgnoreAuth: true });

    // Valid connection
    this.logger.info(
      '[onClientAuthenticated] Connection: %s | Identifier: %s | CONNECTED | Time: %s',
      id,
      this.identifier,
      new Date().toISOString(),
    );

    Promise.all(this.defaultRooms.map((room: string) => Promise.resolve(socket.join(room))))
      .then(() => {
        this.logger.info(
          '[onClientAuthenticated] Connection %s joined all defaultRooms %s',
          id,
          this.defaultRooms,
        );
      })
      .catch(error => {
        this.logger.error(
          '[onClientAuthenticated] Connection %s failed to join defaultRooms %s | Error: %s',
          id,
          this.defaultRooms,
          error,
        );
      });

    // Handle events
    socket.on(SocketIOConstants.EVENT_DISCONNECT, () => {
      this.disconnect({ socket });
    });

    socket.on(SocketIOConstants.EVENT_JOIN, (payload: any) => {
      const { rooms = [] } = payload || {};
      if (!rooms?.length) {
        return;
      }

      Promise.all(rooms.map((room: string) => socket.join(room)))
        .then(() => {
          this.logger.info(
            '[%s] Connection: %s joined all rooms %s',
            SocketIOConstants.EVENT_JOIN,
            id,
            rooms,
          );
        })
        .catch(error => {
          this.logger.error(
            '[%s] Connection %s failed to join rooms %s | Error: %s',
            SocketIOConstants.EVENT_JOIN,
            id,
            rooms,
            error,
          );
        });

      this.logger.info(
        '[%s] Connection: %s | JOIN Rooms: %j',
        SocketIOConstants.EVENT_JOIN,
        id,
        rooms,
      );
    });

    socket.on(SocketIOConstants.EVENT_LEAVE, (payload: any) => {
      const { rooms = [] } = payload || { room: [] };
      if (!rooms?.length) {
        return;
      }

      Promise.all(rooms.map((room: string) => socket.leave(room)))
        .then(() => {
          this.logger.info(
            '[%s] Connection %s left all rooms %s',
            SocketIOConstants.EVENT_LEAVE,
            id,
            rooms,
          );
        })
        .catch(error => {
          this.logger.error(
            '[%s] Connection %s failed to leave rooms %s | Error: %s',
            SocketIOConstants.EVENT_LEAVE,
            id,
            rooms,
            error,
          );
        });

      this.logger.info(
        '[%s] Connection: %s | LEAVE Rooms: %j',
        SocketIOConstants.EVENT_LEAVE,
        id,
        rooms,
      );
    });

    this.clients[id].interval = setInterval(() => {
      this.ping({ socket, doIgnoreAuth: true });
    }, 30000);

    this.send({
      destination: socket.id,
      payload: {
        topic: SocketIOConstants.EVENT_AUTHENTICATED,
        data: {
          id: socket.id,
          time: new Date().toISOString(),
        },
      },
      // log: true,
    });

    this.onClientConnected?.({ socket })
      ?.then(() => {})
      .catch(error => {
        this.logger.error('[onClientConnected][Handler] Error: %s', error);
      });
  }

  // -------------------------------------------------------------------------------------------------------------
  ping(opts: { socket: IOSocket; doIgnoreAuth: boolean }) {
    const { socket, doIgnoreAuth } = opts;

    if (!socket) {
      this.logger.info('[ping] Socket is undefined to PING!');
      return;
    }

    const client = this.clients[socket.id];
    if (!doIgnoreAuth && client.state !== 'authenticated') {
      this.logger.info(
        '[ping] Socket client is not authenticated | Authenticated: %s',
        client.state,
      );
      this.disconnect({ socket });
      return;
    }

    this.send({
      destination: socket.id,
      payload: {
        topic: SocketIOConstants.EVENT_PING,
        data: {
          time: new Date().toISOString(),
        },
      },
      // log: true,
    });
  }

  // -------------------------------------------------------------------------------------------------------------
  disconnect(opts: { socket: IOSocket }) {
    const { socket } = opts;
    if (!socket) {
      return;
    }

    const { id } = socket;

    if (this.clients[id]) {
      const { interval, authenticateTimeout } = this.clients[id];
      if (interval) {
        clearInterval(interval);
      }

      if (authenticateTimeout) {
        clearTimeout(authenticateTimeout);
      }

      delete this.clients[id];
    }

    this.logger.info(
      '[disconnect] Connection: %s | DISCONNECT | Time: %s',
      id,
      new Date().toISOString(),
    );
    socket.disconnect();
  }

  // -------------------------------------------------------------------------------------------------------------
  send(opts: {
    destination: string;
    payload: { topic: string; data: any };
    doLog?: boolean;
    cb?: () => void;
  }) {
    const { destination, payload, doLog, cb } = opts;
    if (!payload) {
      return;
    }

    const { topic, data } = payload;
    if (!topic || !data) {
      return;
    }

    const sender = this.emitter.compress(true);

    if (destination && !isEmpty(destination)) {
      sender.to(destination).emit(topic, data);
    } else {
      sender.emit(topic, data);
    }

    cb?.();

    if (!doLog) {
      return;
    }

    this.logger.info(
      `[send] Message has emitted! To: ${destination} | Topic: ${topic} | Message: ${JSON.stringify(data)}`,
    );
  }
}
