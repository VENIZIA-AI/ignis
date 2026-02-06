import { HTTP } from '@/common';
import { RuntimeModules, TRuntimeModule } from '@/common/constants';
import { ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/helpers/base';
import { getError } from '@/helpers/error';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import { Cluster, Redis } from 'ioredis';
import isEmpty from 'lodash/isEmpty';
import { Server as HTTPServer } from 'node:http';
import { Server as IOServer, Socket as IOSocket, ServerOptions } from 'socket.io';
import {
  IHandshake,
  ISocketIOClient,
  TSocketIOServerOptions,
  SocketIOClientStates,
  SocketIOConstants,
} from '../common';

const CLIENT_AUTHENTICATE_TIMEOUT = 10_000;

type TRedisClient = Redis | Cluster;

// -------------------------------------------------------------------------------------------------------------
export class SocketIOServerHelper extends BaseHelper {
  private runtime: TRuntimeModule;
  private server?: HTTPServer;
  private bunEngine?: any; // @socket.io/bun-engine Server instance
  private serverOptions: Partial<ServerOptions> = {};

  // Tracked Redis clients for proper cleanup
  private redisPub: TRedisClient;
  private redisSub: TRedisClient;
  private redisEmitter: TRedisClient;

  private authenticateFn: (args: IHandshake) => ValueOrPromise<boolean>;
  private onClientConnected?: (opts: { socket: IOSocket }) => ValueOrPromise<void>;

  private authenticateTimeout: number;
  private defaultRooms: string[];

  private io: IOServer;
  private emitter: Emitter;

  private clients: Map<string, ISocketIOClient> = new Map();

  constructor(opts: TSocketIOServerOptions) {
    super({ scope: opts.identifier });

    const { redisConnection } = opts;

    this.identifier = opts.identifier;
    this.runtime = opts.runtime;
    this.serverOptions = opts?.serverOptions ?? {};

    this.authenticateFn = opts.authenticateFn;
    this.onClientConnected = opts.clientConnectedFn;

    this.authenticateTimeout = opts.authenticateTimeout ?? CLIENT_AUTHENTICATE_TIMEOUT;
    this.defaultRooms = opts.defaultRooms ?? [
      SocketIOConstants.ROOM_DEFAULT,
      SocketIOConstants.ROOM_NOTIFICATION,
    ];

    // Validate runtime-specific server/engine
    switch (opts.runtime) {
      case RuntimeModules.NODE: {
        if (!opts.server) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: '[SocketIOServerHelper] Invalid HTTP server for Node.js runtime!',
          });
        }
        this.server = opts.server;
        break;
      }
      case RuntimeModules.BUN: {
        if (!opts.engine) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message:
              '[SocketIOServerHelper] Invalid @socket.io/bun-engine instance for Bun runtime!',
          });
        }
        this.bunEngine = opts.engine;
        break;
      }
      default: {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: '[SocketIOServerHelper] Unsupported runtime!',
        });
      }
    }

    // Validate and create Redis clients
    if (!redisConnection) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: 'Invalid redis connection to config socket.io adapter!',
      });
    }

    this.redisPub = redisConnection.getClient().duplicate();
    this.redisSub = redisConnection.getClient().duplicate();
    this.redisEmitter = redisConnection.getClient().duplicate();

    this.configure();
  }

  // -------------------------------------------------------------------------------------------------------------
  getIOServer(): IOServer {
    return this.io;
  }

  // -------------------------------------------------------------------------------------------------------------
  getClients(opts?: { id?: string }): ISocketIOClient | Map<string, ISocketIOClient> | undefined {
    const { id } = opts ?? {};

    if (id) {
      return this.clients.get(id);
    }

    return this.clients;
  }

  // -------------------------------------------------------------------------------------------------------------
  on<HandlerArgsType extends unknown[] = unknown[], HanderReturnType = void>(opts: {
    topic: string;
    handler: (...args: HandlerArgsType) => ValueOrPromise<HanderReturnType>;
  }) {
    const { topic, handler } = opts;
    if (!topic) {
      throw getError({ message: '[on] Invalid topic to start binding handler' });
    }

    if (!handler) {
      throw getError({ message: `[on] Invalid event handler | topic: ${topic}` });
    }

    if (!this.io) {
      throw getError({ message: '[on] IOServer is not initialized yet!' });
    }

    this.io.on(topic, handler);
  }

  // -------------------------------------------------------------------------------------------------------------
  getEngine(): any {
    return this.bunEngine;
  }

  // -------------------------------------------------------------------------------------------------------------
  configure() {
    const logger = this.logger.for(this.configure.name);
    logger.info('Configuring IO Server | id: %s | runtime: %s', this.identifier, this.runtime);

    switch (this.runtime) {
      case RuntimeModules.NODE: {
        if (!this.server) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: '[DANGER] Invalid HTTP server instance to init Socket.io server!',
          });
        }
        this.io = new IOServer(this.server, this.serverOptions);
        break;
      }
      case RuntimeModules.BUN: {
        if (!this.bunEngine) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: '[DANGER] Invalid @socket.io/bun-engine instance to init Socket.io server!',
          });
        }
        this.io = new IOServer();
        this.io.bind(this.bunEngine);
        break;
      }
      default: {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[configure] Unsupported runtime: ${this.runtime}`,
        });
      }
    }

    // Config socket.io redis adapter
    this.io.adapter(createAdapter(this.redisPub, this.redisSub));
    logger.info('SocketIO Server initialized Redis Adapter');

    // Config socket.io redis emitter
    this.emitter = new Emitter(this.redisEmitter);
    this.redisEmitter.on('error', (error: Error) => {
      logger.error('Emitter error | error: %j', error);
    });
    logger.info('SocketIO Server initialized Redis Emitter!');

    // Handle socket.io new connection
    this.io.on(SocketIOConstants.EVENT_CONNECT, (socket: IOSocket) => {
      this.onClientConnect({ socket });
    });

    logger.info(
      'SocketIO Server READY | path: %s | runtime: %s',
      this.serverOptions?.path ?? '',
      this.runtime,
    );
  }

  // -------------------------------------------------------------------------------------------------------------
  onClientConnect(opts: { socket: IOSocket }) {
    const logger = this.logger.for(this.onClientConnect.name);
    const { socket } = opts;

    if (!socket) {
      logger.info('Invalid new socket connection!');
      return;
    }

    // Validate user identifier
    const { id, handshake } = socket;
    if (this.clients.has(id)) {
      logger.info('Socket client already existed | id: %s', id);
      return;
    }

    logger.info('New connection request | id: %s', id);

    // Create client entry
    const client: ISocketIOClient = {
      id,
      socket,
      state: SocketIOClientStates.UNAUTHORIZED,
      authenticateTimeout: setTimeout(() => {
        const currentClient = this.clients.get(id);
        if (currentClient?.state === SocketIOClientStates.AUTHENTICATED) {
          return;
        }

        this.disconnect({ socket });
      }, this.authenticateTimeout),
    };
    this.clients.set(id, client);

    // Register disconnect handler immediately (Bug Fix #4)
    socket.on(SocketIOConstants.EVENT_DISCONNECT, () => {
      this.disconnect({ socket });
    });

    // Handle authentication
    const authLogger = this.logger.for('onClientAuthenticate');
    socket.on(SocketIOConstants.EVENT_AUTHENTICATE, () => {
      const currentClient = this.clients.get(id);
      if (!currentClient) {
        authLogger.warn('Client no longer exists during auth | id: %s', id);
        return;
      }

      if (currentClient.state !== SocketIOClientStates.UNAUTHORIZED) {
        authLogger.warn(
          'Client attempted auth in invalid state | id: %s | currentState: %s',
          id,
          currentClient.state,
        );
        return;
      }

      currentClient.state = SocketIOClientStates.AUTHENTICATING;

      Promise.resolve(this.authenticateFn(handshake))
        .then((rs: boolean) => {
          if (!this.clients.has(id)) {
            authLogger.info('Client disconnected during authentication | id: %s', id);
            return;
          }

          authLogger.info('Authentication completed | id: %s | result: %s', id, rs);

          // Valid connection
          if (rs) {
            this.onClientAuthenticated({ socket });
            return;
          }

          // Invalid connection - check client still exists
          const failedClient = this.clients.get(id);
          if (failedClient) {
            failedClient.state = SocketIOClientStates.UNAUTHORIZED;
          }

          this.send({
            destination: socket.id,
            payload: {
              topic: SocketIOConstants.EVENT_UNAUTHENTICATE,
              data: {
                message: 'Invalid token to authenticate! Please login again!',
                time: new Date().toISOString(),
              },
            },
            cb: () => {
              this.disconnect({ socket });
            },
          });
        })
        .catch((error: Error) => {
          const errorClient = this.clients.get(id);
          if (errorClient) {
            errorClient.state = SocketIOClientStates.UNAUTHORIZED;
          }

          logger.error('Failed to authenticate | id: %s | error: %s', id, error);

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
    const logger = this.logger.for(this.onClientAuthenticated.name);
    const { socket } = opts;

    if (!socket) {
      logger.info('Invalid new socket connection!');
      return;
    }

    // Validate user identifier
    const { id } = socket;
    const client = this.clients.get(id);
    if (!client) {
      logger.info('Unknown client | id: %s', id);
      this.disconnect({ socket });
      return;
    }

    client.state = SocketIOClientStates.AUTHENTICATED;
    this.ping({ socket, doIgnoreAuth: true });

    // Valid connection
    logger.info(
      'Client connected | id: %s | identifier: %s | time: %s',
      id,
      this.identifier,
      new Date().toISOString(),
    );

    Promise.all(this.defaultRooms.map((room: string) => Promise.resolve(socket.join(room))))
      .then(() => {
        logger.info('Joined default rooms | id: %s | rooms: %s', id, this.defaultRooms);
      })
      .catch(error => {
        logger.error(
          'Failed to join default rooms | id: %s | rooms: %s | error: %s',
          id,
          this.defaultRooms,
          error,
        );
      });

    // Handle events (disconnect already registered in onClientConnect)
    const joinLogger = this.logger.for(SocketIOConstants.EVENT_JOIN);
    socket.on(SocketIOConstants.EVENT_JOIN, (payload: any) => {
      const { rooms = [] } = payload || {};
      if (!rooms?.length) {
        return;
      }

      joinLogger.info('Joining rooms | id: %s | rooms: %j', id, rooms);

      Promise.all(rooms.map((room: string) => socket.join(room)))
        .then(() => {
          joinLogger.info('Joined rooms | id: %s | rooms: %s', id, rooms);
        })
        .catch(error => {
          joinLogger.error(
            'Failed to join rooms | id: %s | rooms: %s | error: %s',
            id,
            rooms,
            error,
          );
        });
    });

    const leaveLogger = this.logger.for(SocketIOConstants.EVENT_LEAVE);
    socket.on(SocketIOConstants.EVENT_LEAVE, (payload: any) => {
      const { rooms = [] } = payload || { room: [] };
      if (!rooms?.length) {
        return;
      }

      leaveLogger.info('Leaving rooms | id: %s | rooms: %j', id, rooms);

      Promise.all(rooms.map((room: string) => socket.leave(room)))
        .then(() => {
          leaveLogger.info('Left rooms | id: %s | rooms: %s', id, rooms);
        })
        .catch(error => {
          leaveLogger.error(
            'Failed to leave rooms | id: %s | rooms: %s | error: %s',
            id,
            rooms,
            error,
          );
        });
    });

    client.interval = setInterval(() => {
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
    });

    this.onClientConnected?.({ socket })
      ?.then(() => {})
      .catch(error => {
        this.logger.for('clientConnectedFn').error('Handler error | error: %s', error);
      });
  }

  // -------------------------------------------------------------------------------------------------------------
  ping(opts: { socket: IOSocket; doIgnoreAuth: boolean }) {
    const logger = this.logger.for(this.ping.name);
    const { socket, doIgnoreAuth } = opts;

    if (!socket) {
      logger.info('Socket is undefined to PING!');
      return;
    }

    const client = this.clients.get(socket.id);

    if (!client) {
      logger.info('Client not found | socketId: %s', socket.id);
      return;
    }

    if (!doIgnoreAuth && client.state !== SocketIOClientStates.AUTHENTICATED) {
      logger.info('Socket client is not authenticated | state: %s', client.state);
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
    });
  }

  // -------------------------------------------------------------------------------------------------------------
  disconnect(opts: { socket: IOSocket }) {
    const logger = this.logger.for(this.disconnect.name);
    const { socket } = opts;
    if (!socket) {
      return;
    }

    const { id } = socket;

    if (this.clients.has(id)) {
      const client = this.clients.get(id)!;
      const { interval, authenticateTimeout } = client;

      if (interval) {
        clearInterval(interval);
      }

      if (authenticateTimeout) {
        clearTimeout(authenticateTimeout);
      }

      this.clients.delete(id);
    }

    logger.info('Client disconnected | id: %s | time: %s', id, new Date().toISOString());
    socket.disconnect();
  }

  // -------------------------------------------------------------------------------------------------------------
  send(opts: {
    destination?: string;
    payload: { topic: string; data: any };
    doLog?: boolean;
    cb?: () => void;
  }) {
    const logger = this.logger.for(this.send.name);
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

    if (cb) {
      setImmediate(cb);
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
  close() {
    return new Promise<void>((resolve, reject) => {
      this.io.close(err => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  // -------------------------------------------------------------------------------------------------------------
  async shutdown() {
    const logger = this.logger.for(this.shutdown.name);
    logger.info('Shutting down SocketIO server...');

    // Disconnect all clients
    for (const [, client] of this.clients) {
      if (client.interval) {
        clearInterval(client.interval);
      }

      if (client.authenticateTimeout) {
        clearTimeout(client.authenticateTimeout);
      }

      client.socket.disconnect();
    }

    this.clients.clear();

    await this.close();

    const cleanupPromises: Promise<string>[] = [];
    if (this.redisPub) {
      cleanupPromises.push(this.redisPub.quit());
    }

    if (this.redisSub) {
      cleanupPromises.push(this.redisSub.quit());
    }

    if (this.redisEmitter) {
      cleanupPromises.push(this.redisEmitter.quit());
    }

    await Promise.all(cleanupPromises);

    logger.info('SocketIO server shutdown complete');
  }
}
