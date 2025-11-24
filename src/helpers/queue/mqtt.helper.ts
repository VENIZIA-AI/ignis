import { BaseHelper } from '@/base/helpers';
import { getError } from '@/helpers/error';
import isEmpty from 'lodash/isEmpty';
import mqtt from 'mqtt';

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
  private client: mqtt.MqttClient;

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

  // -------------------------------------------------------------------------------
  configure() {
    if (this.client) {
      this.logger.info(
        '[configure][%s] MQTT Client already established! Client: %j',
        this.identifier,
        this.client,
      );
      return;
    }

    if (isEmpty(this.url)) {
      throw getError({
        statusCode: 500,
        message: '[configure] Invalid url to configure mqtt client!',
      });
    }

    this.logger.info(
      '[configure][%s] Start configuring mqtt client | Url: %s | Options: %j',
      this.identifier,
      this.url,
      this.options,
    );
    this.client = mqtt.connect(this.url, this.options);

    this.client.on('connect', () => {
      this.onConnect?.();
    });

    this.client.on('disconnect', () => {
      this.onDisconnect?.();
    });

    this.client.on('message', (topic, message) => {
      this.onMessage?.({ topic, message });
    });

    this.client.on('error', error => {
      this.onError?.(error);
    });

    this.client.on('close', (error?: Error) => {
      this.onClose?.(error);
    });
  }

  // -------------------------------------------------------------------------------
  subscribe(opts: { topics: Array<string> }) {
    return new Promise((resolve, reject) => {
      if (!this.client?.connected) {
        reject(
          getError({
            statusCode: 400,
            message: `[subscribe][${this.identifier}] MQTT Client is not available to subscribe topic!`,
          }),
        );
      }

      const { topics } = opts;
      this.client.subscribe(topics, error => {
        if (error) {
          reject(error);
        }

        resolve(topics);
      });
    });
  }

  // -------------------------------------------------------------------------------
  publish(opts: { topic: string; message: string | Buffer }) {
    return new Promise((resolve, reject) => {
      if (!this.client?.connected) {
        reject(
          getError({
            statusCode: 400,
            message: `[publish][${this.identifier}] MQTT Client is not available to subscribe topic!`,
          }),
        );
      }

      const { topic, message } = opts;
      this.client.publish(topic, message, error => {
        if (error) {
          reject(error);
        }

        resolve({ topic, message });
      });
    });
  }
}
