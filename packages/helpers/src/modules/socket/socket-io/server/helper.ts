import { HTTP } from '@/common';
import { RuntimeModules, TRuntimeModule } from '@/common/constants';
import { ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { ensureRedisClientsConnecting, TRedisClient, waitForRedisReady } from '@/modules/redis';
import { voidExecution } from '@/utilities/promise.utility';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import isEmpty from 'lodash/isEmpty';
import { EventEmitter } from 'node:events';
import { Server as HTTPServer } from 'node:http';
import { Server as IOServer, Socket as IOSocket, ServerOptions } from 'socket.io';
import {
  IHandshake,
  ISocketIOClient,
  SocketIOClientStates,
  SocketIOConstants,
  TSocketIOAuthenticateFn,
  TSocketIOClientConnectedFn,
  TSocketIOServerOptions,
  TSocketIOValidateRoomFn,
} from '../common';

const CLIENT_AUTHENTICATE_TIMEOUT = 10_000;
const CLIENT_PING_INTERVAL = 30_000;

export class SocketIOServerHelper extends BaseHelper {
  private runtime: TRuntimeModule;
  private server?: HTTPServer;
  private bunEngine?: any;
  private serverOptions: Partial<ServerOptions> = {};

  private io: IOServer;
  private emitter: Emitter;
  private clients: Map<string, ISocketIOClient> = new Map();

  private redisPub: TRedisClient;
  private redisSub: TRedisClient;
  private redisEmitter: TRedisClient;

  private authenticateFn: TSocketIOAuthenticateFn;
  private validateRoomFn?: TSocketIOValidateRoomFn;
  private onClientConnected?: TSocketIOClientConnectedFn;

  private authenticateTimeout: number;
  private pingInterval: number;
  private defaultRooms: string[];

  constructor(opts: TSocketIOServerOptions) {
    super({ scope: opts.identifier });

    this.identifier = opts.identifier;
    this.runtime = opts.runtime;
    this.serverOptions = opts?.serverOptions ?? {};

    this.authenticateFn = opts.authenticateFn;
    this.validateRoomFn = opts.validateRoomFn;
    this.onClientConnected = opts.clientConnectedFn;

    this.authenticateTimeout = opts.authenticateTimeout ?? CLIENT_AUTHENTICATE_TIMEOUT;
    this.pingInterval = opts.pingInterval ?? CLIENT_PING_INTERVAL;
    this.defaultRooms = opts.defaultRooms ?? [
      SocketIOConstants.ROOM_DEFAULT,
      SocketIOConstants.ROOM_NOTIFICATION,
    ];

    this.setRuntime(opts);
    this.initRedisClients(opts.redisConnection);
  }

  private setRuntime(opts: TSocketIOServerOptions) {
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
  }

  private initRedisClients(redisConnection: TSocketIOServerOptions['redisConnection']) {
    if (!redisConnection) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: 'Invalid redis connection to config socket.io adapter!',
      });
    }

    this.redisPub = redisConnection.duplicateClient();
    this.redisSub = redisConnection.duplicateClient();
    this.redisEmitter = redisConnection.duplicateClient();
  }

  getIOServer(): IOServer {
    return this.io;
  }

  /** Handlers run inside socket.io event listeners - a sync throw there kills the process; voidExecution only catches promise rejections since its argument evaluates before the try/catch. */
  protected invokeHook(opts: { scope: string; execution: () => ValueOrPromise<void> }) {
    const { scope, execution } = opts;

    try {
      voidExecution({ logger: this.logger, scope, execution: execution() });
    } catch (error) {
      this.logger.for(scope).error('Hook execution FAILED | Error: %s', error);
    }
  }

  getEngine() {
    if (this.runtime !== RuntimeModules.BUN) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: '[getEngine] Engine is only available for Bun runtime!',
      });
    }

    return this.bunEngine;
  }

  getClients(opts?: { id?: string }): ISocketIOClient | Map<string, ISocketIOClient> | undefined {
    const { id } = opts ?? {};
    if (id) {
      return this.clients.get(id);
    }
    return this.clients;
  }

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

  async configure() {
    const logger = this.logger.for(this.configure.name);
    logger.info('Configuring IO Server | id: %s | runtime: %s', this.identifier, this.runtime);

    (this.redisPub as EventEmitter).on('error', (error: Error) => {
      logger.error('Redis adapter pub error | error: %s', error);
    });

    (this.redisSub as EventEmitter).on('error', (error: Error) => {
      logger.error('Redis adapter sub error | error: %s', error);
    });

    (this.redisEmitter as EventEmitter).on('error', (error: Error) => {
      logger.error('Redis emitter error | error: %s', error);
    });

    ensureRedisClientsConnecting({
      clients: [this.redisPub, this.redisSub, this.redisEmitter],
      logger: this.logger,
      scope: this.configure.name,
    });

    await Promise.all([
      waitForRedisReady({ client: this.redisPub }),
      waitForRedisReady({ client: this.redisSub }),
      waitForRedisReady({ client: this.redisEmitter }),
    ]);
    logger.info('All Redis connections ready');

    this.initIOServer();

    this.io.adapter(createAdapter(this.redisPub, this.redisSub));
    logger.info('SocketIO Server initialized Redis Adapter');

    this.emitter = new Emitter(this.redisEmitter);
    logger.info('SocketIO Server initialized Redis Emitter');

    this.io.on(SocketIOConstants.EVENT_CONNECT, (socket: IOSocket) => {
      this.onClientConnect({ socket });
    });

    logger.info(
      'SocketIO Server READY | path: %s | runtime: %s',
      this.serverOptions?.path ?? '',
      this.runtime,
    );
  }

  private initIOServer() {
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
  }

  onClientConnect(opts: { socket: IOSocket }) {
    const logger = this.logger.for(this.onClientConnect.name);
    const { socket } = opts;

    if (!socket) {
      logger.info('Invalid new socket connection!');
      return;
    }

    const { id, handshake } = socket;
    if (this.clients.has(id)) {
      logger.info('Socket client already existed | id: %s', id);
      return;
    }

    logger.info('New connection request | id: %s', id);

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

    socket.on(SocketIOConstants.EVENT_DISCONNECT, () => {
      this.disconnect({ socket });
    });

    this.registerAuthHandler({ socket, handshake, clientId: id });
  }

  private registerAuthHandler(opts: { socket: IOSocket; handshake: IHandshake; clientId: string }) {
    const { socket, handshake, clientId: id } = opts;
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

      Promise.resolve()
        .then(() => this.authenticateFn(handshake))
        .then((rs: boolean) => {
          if (!this.clients.has(id)) {
            authLogger.info('Client disconnected during authentication | id: %s', id);
            return;
          }

          authLogger.info('Authentication completed | id: %s | result: %s', id, rs);

          if (rs) {
            this.onClientAuthenticated({ socket });
            return;
          }

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
            callback: () => {
              this.disconnect({ socket });
            },
          });
        })
        .catch((error: Error) => {
          const errorClient = this.clients.get(id);
          if (errorClient) {
            errorClient.state = SocketIOClientStates.UNAUTHORIZED;
          }

          authLogger.error('Failed to authenticate | id: %s | error: %s', id, error);

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
            callback: () => {
              this.disconnect({ socket });
            },
          });
        });
    });
  }

  onClientAuthenticated(opts: { socket: IOSocket }) {
    const logger = this.logger.for(this.onClientAuthenticated.name);
    const { socket } = opts;

    if (!socket) {
      logger.info('Invalid new socket connection!');
      return;
    }

    const { id } = socket;
    const client = this.clients.get(id);
    if (!client) {
      logger.info('Unknown client | id: %s', id);
      this.disconnect({ socket });
      return;
    }

    client.state = SocketIOClientStates.AUTHENTICATED;

    // The authenticate deadline is over: leaving it armed keeps a timer per client alive
    if (client.authenticateTimeout) {
      clearTimeout(client.authenticateTimeout);
      client.authenticateTimeout = undefined;
    }

    this.ping({ socket, doIgnoreAuth: true });

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

    this.registerRoomHandlers({ socket, clientId: id });

    client.interval = setInterval(() => {
      this.ping({ socket, doIgnoreAuth: true });
    }, this.pingInterval);

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

    this.invokeHook({
      scope: 'clientConnectedFn',
      execution: () => this.onClientConnected?.({ socket }),
    });
  }

  /**
   * Narrows an untrusted room payload to the strings it actually contains.
   *
   * The listeners below run on data any authenticated client sends. Destructuring `{ rooms = [] }`
   * out of an `any` and testing `rooms?.length` accepts a STRING - `{"rooms":"lobby"}` has a
   * length of 5 - and the next line calls `rooms.map`, which a string does not have. socket.io
   * dispatches on `process.nextTick` with no try/catch around the handler, so that TypeError
   * escapes as an uncaught exception and takes the process with it.
   */
  private static toRoomList(payload: unknown): string[] {
    const rooms = (payload as { rooms?: unknown } | null | undefined)?.rooms;
    return Array.isArray(rooms)
      ? rooms.filter((room): room is string => typeof room === 'string')
      : [];
  }

  private registerRoomHandlers(opts: { socket: IOSocket; clientId: string }) {
    const { socket, clientId: id } = opts;

    const joinLogger = this.logger.for(SocketIOConstants.EVENT_JOIN);
    socket.on(SocketIOConstants.EVENT_JOIN, (payload: any) => {
      const rooms = SocketIOServerHelper.toRoomList(payload);
      if (!rooms.length) {
        return;
      }

      const validateRoomFn = this.validateRoomFn;
      if (!validateRoomFn) {
        joinLogger.warn(
          'Join rejected | id: %s | rooms: %j | reason: no validateRoomFn configured',
          id,
          rooms,
        );
        return;
      }

      Promise.resolve()
        .then(() => validateRoomFn({ socket, rooms }))
        .then((allowedRooms: string[]) => {
          if (!allowedRooms?.length) {
            joinLogger.warn(
              'Join rejected | id: %s | rooms: %j | reason: no rooms allowed',
              id,
              rooms,
            );
            return;
          }

          joinLogger.info('Joining rooms | id: %s | rooms: %j', id, allowedRooms);

          for (const room of allowedRooms) {
            voidExecution({
              logger: this.logger,
              scope: SocketIOConstants.EVENT_JOIN,
              execution: socket.join(room),
            });
          }

          joinLogger.info('Joined rooms | id: %s | rooms: %s', id, allowedRooms);
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
      const rooms = SocketIOServerHelper.toRoomList(payload);
      if (!rooms.length) {
        return;
      }

      leaveLogger.info('Leaving rooms | id: %s | rooms: %j', id, rooms);

      // `Promise.resolve` per room: socket.io declares `leave(room): Promise<void> | void` - the
      // default adapter is synchronous, a clustered one is not - and `Promise.all` over a mixed
      // iterable is what the previous `any`-typed payload was hiding.
      Promise.all(rooms.map(room => Promise.resolve(socket.leave(room))))
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
  }

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

    socket.emit(SocketIOConstants.EVENT_PING, { time: new Date().toISOString() });
  }

  disconnect(opts: { socket: IOSocket }) {
    const logger = this.logger.for(this.disconnect.name);
    const { socket } = opts;
    if (!socket) {
      return;
    }

    const { id } = socket;

    if (this.clients.has(id)) {
      const client = this.clients.get(id)!;

      if (client.interval) {
        clearInterval(client.interval);
      }

      if (client.authenticateTimeout) {
        clearTimeout(client.authenticateTimeout);
      }

      this.clients.delete(id);
    }

    logger.info('Client disconnected | id: %s | time: %s', id, new Date().toISOString());
    socket.disconnect();
  }

  send(opts: {
    destination?: string;
    payload: { topic: string; data: any };
    doLog?: boolean;
    callback?: () => void;
  }) {
    const logger = this.logger.for(this.send.name);
    const { destination, payload, doLog, callback } = opts;

    if (!payload) {
      return;
    }

    const { topic, data } = payload;
    if (!topic || !data) {
      return;
    }

    if (!this.emitter) {
      logger.error(
        'Cannot emit | Redis emitter is not initialized | call configure() first | topic: %s',
        topic,
      );
      return;
    }

    const sender = this.emitter.compress(true);

    if (destination && !isEmpty(destination)) {
      sender.to(destination).emit(topic, data);
    } else {
      sender.emit(topic, data);
    }

    if (callback) {
      setImmediate(callback);
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

  private close() {
    return new Promise<void>((resolve, reject) => {
      // configure() may never have run (or may have failed): there is nothing to close, but the redis clients still have to be released by the caller
      if (!this.io) {
        this.logger.for('close').info('SKIP close | IOServer was never initialized');
        resolve();
        return;
      }

      voidExecution({
        logger: this.logger,
        scope: 'close',
        execution: this.io.close(error => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        }),
      });
    });
  }

  async shutdown() {
    const logger = this.logger.for(this.shutdown.name);
    logger.info('Shutting down SocketIO server...');

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

    try {
      await this.close();
    } finally {
      // close() rejects when io.close() reports a lingering handle. Skipping the quits there leaves three live Redis sockets holding the event loop open, and a SIGTERM handler never returns.
      await Promise.all([this.redisPub?.quit(), this.redisSub?.quit(), this.redisEmitter?.quit()]);
    }

    logger.info('SocketIO server shutdown complete');
  }
}
