import { ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/helpers/base';
import { getError } from '@/helpers/error';
import { io, type Socket } from 'socket.io-client';
import {
  IOptions,
  ISocketIOClientOptions,
  SocketIOClientStates,
  SocketIOConstants,
  TSocketIOEventHandler,
  TSocketIOClientState,
} from '../common';

export class SocketIOClientHelper extends BaseHelper {
  private host: string;
  private options: IOptions;
  private client: Socket;
  private state: TSocketIOClientState = SocketIOClientStates.UNAUTHORIZED;

  // Lifecycle callbacks
  private onConnected?: () => ValueOrPromise<void>;
  private onDisconnected?: (reason: string) => ValueOrPromise<void>;
  private onError?: (error: Error) => ValueOrPromise<void>;
  private onAuthenticated?: () => ValueOrPromise<void>;
  private onUnauthenticated?: (message: string) => ValueOrPromise<void>;

  constructor(opts: ISocketIOClientOptions) {
    super({ scope: opts.identifier });

    this.identifier = opts.identifier;
    this.host = opts.host;
    this.options = opts.options;

    // Store lifecycle callbacks
    this.onConnected = opts.onConnected;
    this.onDisconnected = opts.onDisconnected;
    this.onError = opts.onError;
    this.onAuthenticated = opts.onAuthenticated;
    this.onUnauthenticated = opts.onUnauthenticated;

    this.configure();
  }

  // -----------------------------------------------------------------
  getState(): TSocketIOClientState {
    return this.state;
  }

  // -----------------------------------------------------------------
  configure() {
    const logger = this.logger.for(this.configure.name);

    if (this.client) {
      logger.info('SocketIO Client already established | id: %s', this.identifier);
      return;
    }

    this.client = io(this.host, this.options);

    // Register connection lifecycle handlers
    this.client.on(SocketIOConstants.EVENT_CONNECT, () => {
      logger.info('Connected | id: %s', this.identifier);

      Promise.resolve(this.onConnected?.()).catch(error => {
        logger.error('onConnected callback error | error: %s', error);
      });
    });

    this.client.on(SocketIOConstants.EVENT_DISCONNECT, (reason: string) => {
      logger.info('Disconnected | id: %s | reason: %s', this.identifier, reason);
      this.state = SocketIOClientStates.UNAUTHORIZED;

      Promise.resolve(this.onDisconnected?.(reason)).catch(error => {
        logger.error('onDisconnected callback error | error: %s', error);
      });
    });

    this.client.on('connect_error', (error: Error) => {
      logger.error('Connection error | id: %s | error: %s', this.identifier, error);

      Promise.resolve(this.onError?.(error)).catch(err => {
        logger.error('onError callback error | error: %s', err);
      });
    });

    // Handle server authentication responses
    this.client.on(SocketIOConstants.EVENT_AUTHENTICATED, (data: unknown) => {
      logger.info('Authenticated | id: %s | data: %j', this.identifier, data);
      this.state = SocketIOClientStates.AUTHENTICATED;

      Promise.resolve(this.onAuthenticated?.()).catch(error => {
        logger.error('onAuthenticated callback error | error: %s', error);
      });
    });

    this.client.on(SocketIOConstants.EVENT_UNAUTHENTICATE, (data: { message?: string }) => {
      logger.warn('Unauthenticated | id: %s | data: %j', this.identifier, data);
      this.state = SocketIOClientStates.UNAUTHORIZED;

      Promise.resolve(this.onUnauthenticated?.(data?.message ?? '')).catch(error => {
        logger.error('onUnauthenticated callback error | error: %s', error);
      });
    });

    // Handle ping from server
    this.client.on(SocketIOConstants.EVENT_PING, () => {
      logger.debug('Ping received | id: %s', this.identifier);
    });
  }

  // -----------------------------------------------------------------
  getSocketClient(): Socket {
    return this.client;
  }

  // -----------------------------------------------------------------
  authenticate() {
    const logger = this.logger.for(this.authenticate.name);

    if (!this.client?.connected) {
      logger.warn('Cannot authenticate | id: %s | reason: not connected', this.identifier);
      return;
    }

    if (this.state !== SocketIOClientStates.UNAUTHORIZED) {
      logger.warn('Cannot authenticate | id: %s | currentState: %s', this.identifier, this.state);
      return;
    }

    this.state = SocketIOClientStates.AUTHENTICATING;
    this.client.emit(SocketIOConstants.EVENT_AUTHENTICATE);
    logger.info('Authentication requested | id: %s', this.identifier);
  }

  // -----------------------------------------------------------------
  subscribe<T = unknown>(opts: {
    event: string;
    handler: TSocketIOEventHandler<T>;
    ignoreDuplicate?: boolean;
  }) {
    const logger = this.logger.for(this.subscribe.name);
    const { event, handler, ignoreDuplicate = true } = opts;

    if (!handler) {
      logger.warn('No handler provided | event: %s', event);
      return;
    }

    if (ignoreDuplicate && this.client.hasListeners(event)) {
      logger.info('Handler already exists | event: %s', event);
      return;
    }

    // Wrap handler in try-catch for error safety
    const wrappedHandler = (data: T) => {
      Promise.resolve(handler(data)).catch(error => {
        logger.error('Handler error | event: %s | error: %s', event, error);
      });
    };

    this.client.on(event, wrappedHandler);
    logger.info('Subscribed | event: %s', event);
  }

  // Keep batch subscribe for convenience
  subscribeMany(opts: {
    events: Record<string, TSocketIOEventHandler>;
    ignoreDuplicate?: boolean;
  }) {
    const { events, ignoreDuplicate } = opts;

    for (const event in events) {
      this.subscribe({
        event,
        handler: events[event],
        ignoreDuplicate,
      });
    }
  }

  // -----------------------------------------------------------------
  unsubscribe(opts: { event: string; handler?: TSocketIOEventHandler }) {
    const logger = this.logger.for(this.unsubscribe.name);
    const { event, handler } = opts;

    if (!this.client?.hasListeners(event)) {
      logger.info('No listeners to remove | event: %s', event);
      return;
    }

    if (handler) {
      this.client.off(event, handler as (...args: unknown[]) => void);
      logger.info('Removed specific handler | event: %s', event);
      return;
    }

    this.client.off(event);
    logger.info('Removed all handlers | event: %s', event);
  }

  unsubscribeMany(opts: { events: string[] }) {
    for (const event of opts.events) {
      this.unsubscribe({ event });
    }
  }

  // -----------------------------------------------------------------
  connect() {
    const logger = this.logger.for(this.connect.name);

    if (!this.client) {
      logger.info('Invalid client to connect | id: %s', this.identifier);
      return;
    }

    this.client.connect();
  }

  // -----------------------------------------------------------------
  disconnect() {
    const logger = this.logger.for(this.disconnect.name);

    if (!this.client) {
      logger.info('Invalid client to disconnect | id: %s', this.identifier);
      return;
    }

    this.client.disconnect();
  }

  // -----------------------------------------------------------------
  emit<T = unknown>(opts: { topic: string; data: T; doLog?: boolean; cb?: () => void }) {
    const logger = this.logger.for(this.emit.name);
    const { topic, data, doLog = false, cb } = opts;

    if (!this.client?.connected) {
      throw getError({
        statusCode: 400,
        message: 'Invalid socket client state to emit',
      });
    }

    if (!topic) {
      throw getError({
        statusCode: 400,
        message: 'Topic is required to emit',
      });
    }

    this.client.emit(topic, data);

    if (cb) {
      setImmediate(cb);
    }

    if (doLog) {
      logger.info('Emitted | topic: %s | data: %j', topic, data);
    }
  }

  // -----------------------------------------------------------------
  joinRooms(opts: { rooms: string[] }) {
    const logger = this.logger.for(this.joinRooms.name);
    const { rooms } = opts;

    if (!this.client?.connected) {
      logger.warn('Cannot join rooms | id: %s | reason: not connected', this.identifier);
      return;
    }

    this.client.emit(SocketIOConstants.EVENT_JOIN, { rooms });
    logger.info('Join rooms requested | id: %s | rooms: %j', this.identifier, rooms);
  }

  // -----------------------------------------------------------------
  leaveRooms(opts: { rooms: string[] }) {
    const logger = this.logger.for(this.leaveRooms.name);
    const { rooms } = opts;

    if (!this.client?.connected) {
      logger.warn('Cannot leave rooms | id: %s | reason: not connected', this.identifier);
      return;
    }

    this.client.emit(SocketIOConstants.EVENT_LEAVE, { rooms });
    logger.info('Leave rooms requested | id: %s | rooms: %j', this.identifier, rooms);
  }

  // -----------------------------------------------------------------
  shutdown() {
    const logger = this.logger.for(this.shutdown.name);
    logger.info('Shutting down SocketIO client | id: %s', this.identifier);

    if (this.client) {
      // Remove all listeners to prevent memory leaks
      this.client.removeAllListeners();

      if (this.client.connected) {
        this.client.disconnect();
      }
    }

    this.state = SocketIOClientStates.UNAUTHORIZED;
    logger.info('SocketIO client shutdown complete | id: %s', this.identifier);
  }
}
