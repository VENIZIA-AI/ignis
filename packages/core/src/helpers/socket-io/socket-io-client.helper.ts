import { ApplicationLogger, LoggerFactory } from '@/helpers/logger';
import { getError } from '@/helpers/error';
import { type Socket, io } from 'socket.io-client';
import { IOptions, ISocketIOClientOptions } from './types';
import { validateModule } from '@/utilities/module.utility';

export class SocketIOClientHelper {
  private logger: ApplicationLogger;

  private identifier: string;
  private host: string;
  private options: IOptions;
  private client: Socket;

  constructor(opts: ISocketIOClientOptions) {
    this.logger = LoggerFactory.getLogger([SocketIOClientHelper.name]);

    this.identifier = opts.identifier;
    this.host = opts.host;
    this.options = opts.options;

    this.configure();
  }

  // -----------------------------------------------------------------
  configure() {
    if (this.client) {
      this.logger.info(
        '[configure][%s] SocketIO Client already established! Client: %j',
        this.identifier,
        this.client,
      );
      return;
    }

    validateModule({
      scope: SocketIOClientHelper.name,
      modules: ['socket.io-client'],
    });
    this.client = io(this.host, this.options);
  }

  // -----------------------------------------------------------------
  getSocketClient(): Socket {
    return this.client;
  }

  // -----------------------------------------------------------------
  subscribe(opts: { events: Record<string, (...props: any) => void>; ignoreDuplicate?: boolean }) {
    const { events: eventHandlers, ignoreDuplicate = false } = opts;

    const eventNames = Object.keys(eventHandlers);
    this.logger.info('[subscribe][%s] Handling events: %j', this.identifier, eventNames);

    for (const eventName of eventNames) {
      const handler = eventHandlers[eventName];
      if (!handler) {
        this.logger.info(
          '[subscribe][%s] Ignore handling event %s because of no handler!',
          this.identifier,
          eventName,
        );
        continue;
      }

      if (ignoreDuplicate && this.client.hasListeners(eventName)) {
        this.logger.info(
          '[subscribe][%s] Ignore handling event %s because of duplicate handler!',
          this.identifier,
          eventName,
        );
        continue;
      }

      this.client.on(eventName, (...props: any[]) => {
        handler(this.client, ...props);
      });
    }
  }

  // -----------------------------------------------------------------
  unsubscribe(opts: { events: Array<string> }) {
    const { events: eventNames } = opts;
    this.logger.info('[unsubscribe][%s] Handling events: %j', this.identifier, eventNames);
    for (const eventName of eventNames) {
      if (!this.client?.hasListeners(eventName)) {
        continue;
      }

      this.client.off(eventName);
    }
  }

  // -----------------------------------------------------------------
  connect() {
    if (!this.client) {
      this.logger.info('[connect][%s] Invalid client to connect!', this.identifier);
      return;
    }

    this.client.connect();
  }

  // -----------------------------------------------------------------
  disconnect() {
    if (!this.client) {
      this.logger.info('[disconnect][%s] Invalid client to disconnect!', this.identifier);
      return;
    }

    this.client.disconnect();
  }

  // -----------------------------------------------------------------
  emit(opts: { topic: string; message: string; doLog?: boolean }) {
    if (!this.client?.connected) {
      throw getError({
        statusCode: 400,
        message: `[emit] Invalid socket client state to emit!`,
      });
    }

    const { topic, message, doLog = false } = opts;
    this.client.emit(topic, message);

    if (!doLog) {
      return;
    }

    this.logger.info('[emit][%s] Topic: %s | Message: %j', this.identifier, topic, message);
  }
}
