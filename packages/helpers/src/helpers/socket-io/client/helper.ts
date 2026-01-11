import { BaseHelper } from '@/helpers/base';
import { getError } from '@/helpers/error';
import { io, type Socket } from 'socket.io-client';
import { IOptions, ISocketIOClientOptions } from '../common';

export class SocketIOClientHelper extends BaseHelper {
  private host: string;
  private options: IOptions;
  private client: Socket;

  constructor(opts: ISocketIOClientOptions) {
    super({ scope: opts.identifier });

    this.identifier = opts.identifier;
    this.host = opts.host;
    this.options = opts.options;

    this.configure();
  }

  // -----------------------------------------------------------------
  configure() {
    if (this.client) {
      this.logger
        .for(this.configure.name)
        .info('[%s] SocketIO Client already established! Client: %j', this.identifier, this.client);
      return;
    }

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
    this.logger
      .for(this.subscribe.name)
      .info('[%s] Handling events: %j', this.identifier, eventNames);

    for (const eventName of eventNames) {
      const handler = eventHandlers[eventName];
      if (!handler) {
        this.logger
          .for(this.subscribe.name)
          .info('[%s] Ignore handling event %s because of no handler!', this.identifier, eventName);
        continue;
      }

      if (ignoreDuplicate && this.client.hasListeners(eventName)) {
        this.logger
          .for(this.subscribe.name)
          .info(
            '[%s] Ignore handling event %s because of duplicate handler!',
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
    this.logger
      .for(this.unsubscribe.name)
      .info('[%s] Handling events: %j', this.identifier, eventNames);
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
      this.logger
        .for(this.connect.name)
        .info('Invalid client to connect! | ID: %s', this.identifier);
      return;
    }

    this.client.connect();
  }

  // -----------------------------------------------------------------
  disconnect() {
    if (!this.client) {
      this.logger
        .for(this.disconnect.name)
        .info('[%s] Invalid client to disconnect!', this.identifier);
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

    this.logger
      .for(this.emit.name)
      .info('[%s] Topic: %s | Message: %j', this.identifier, topic, message);
  }
}
