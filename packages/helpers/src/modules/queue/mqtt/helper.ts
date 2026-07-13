import { redactSecrets, redactUrlCredentials } from '@/common/redact';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import isEmpty from 'lodash/isEmpty';
import mqtt from 'mqtt';
import { invokeHook } from '../common';

export interface IMQTTClientOptions {
  identifier: string;
  url: string;
  options: mqtt.IClientOptions;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onClose?: (error?: Error) => void;
  onMessage: (opts: { topic: string; message: Buffer }) => void;
}

export class MQTTClientHelper extends BaseHelper {
  private url: string;
  private options: mqtt.IClientOptions;
  private client?: mqtt.MqttClient;

  private onConnect?: () => void;
  private onDisconnect?: () => void;
  private onError?: (error: Error) => void;
  private onClose?: (error?: Error) => void;
  private onMessage: (opts: { topic: string; message: Buffer }) => void;

  constructor(opts: IMQTTClientOptions) {
    super({ scope: MQTTClientHelper.name, identifier: opts.identifier });

    this.url = opts.url;
    this.options = opts.options;

    this.onConnect = opts.onConnect;
    this.onClose = opts.onClose;
    this.onError = opts.onError;
    this.onDisconnect = opts.onDisconnect;
    this.onMessage = opts.onMessage;

    this.configure();
  }

  configure() {
    if (this.client) {
      // Never serialize the client: it holds the resolved IClientOptions, password included.
      this.logger
        .for(this.configure.name)
        .info(
          '[%s] MQTT Client already established | Connected: %s',
          this.identifier,
          this.client.connected,
        );
      return;
    }

    if (isEmpty(this.url)) {
      throw getError({
        statusCode: 500,
        message: '[configure] Invalid url to configure mqtt client!',
      });
    }

    this.logger
      .for(this.configure.name)
      .info(
        '[%s] Start configuring mqtt client | Url: %s | Options: %j',
        this.identifier,
        redactUrlCredentials(this.url),
        redactSecrets(this.options),
      );
    this.client = this.createClient({ url: this.url, options: this.options });

    this.client.on('connect', () => {
      invokeHook({
        logger: this.logger,
        scope: 'onConnect',
        execution: () => this.onConnect?.(),
      });
    });

    this.client.on('disconnect', () => {
      invokeHook({
        logger: this.logger,
        scope: 'onDisconnect',
        execution: () => this.onDisconnect?.(),
      });
    });

    this.client.on('message', (topic, message) => {
      invokeHook({
        logger: this.logger,
        scope: 'onMessage',
        execution: () => this.onMessage?.({ topic, message }),
      });
    });

    this.client.on('error', error => {
      invokeHook({
        logger: this.logger,
        scope: 'onError',
        execution: () => this.onError?.(error),
      });
    });

    this.client.on('close', (error?: Error) => {
      invokeHook({
        logger: this.logger,
        scope: 'onClose',
        execution: () => this.onClose?.(error),
      });
    });
  }

  /** Client factory seam - overridden in tests to run the helper without a broker. */
  protected createClient(opts: { url: string; options: mqtt.IClientOptions }): mqtt.MqttClient {
    return mqtt.connect(opts.url, opts.options);
  }

  getClient() {
    return this.client;
  }

  /**
   * Tear the client down. Without it the mqtt client - and its reconnect timer - outlives the helper
   * forever. Resolves once the driver reports the connection ended; safe to call more than once.
   */
  close(opts?: { isForce?: boolean }): Promise<void> {
    const client = this.client;
    this.client = undefined;

    if (!client) {
      return Promise.resolve();
    }

    const isForce = opts?.isForce ?? false;

    return new Promise<void>(resolve => {
      client.end(isForce, undefined, () => {
        this.logger.for(this.close.name).info('[%s] MQTT Client closed!', this.identifier);
        resolve();
      });
    });
  }

  subscribe(opts: { topics: Array<string> }) {
    const client = this.client;

    return new Promise((resolve, reject) => {
      if (!client?.connected) {
        return reject(
          getError({
            statusCode: 400,
            message: `[subscribe][${this.identifier}] MQTT Client is not available to subscribe topic!`,
          }),
        );
      }

      const { topics } = opts;
      client.subscribe(topics, error => {
        if (error) {
          return reject(error);
        }

        resolve(topics);
      });
    });
  }

  publish(opts: { topic: string; message: string | Buffer }) {
    const client = this.client;

    return new Promise((resolve, reject) => {
      if (!client?.connected) {
        return reject(
          getError({
            statusCode: 400,
            message: `[publish][${this.identifier}] MQTT Client is not available to publish message!`,
          }),
        );
      }

      const { topic, message } = opts;
      client.publish(topic, message, error => {
        if (error) {
          return reject(error);
        }

        resolve({ topic, message });
      });
    });
  }
}
