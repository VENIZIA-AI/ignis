import type { AnyType } from '@/common';
import { getError } from '@/modules/error';
import { BaseHelper } from '@/modules/base';
import type { Base, BaseOptions, ConnectionPoolEventPayload } from '@platformatic/kafka';
import { invokeHook } from '../common';
import {
  KafkaClientEvents,
  KafkaDefaults,
  KafkaHealthStatuses,
  type TKafkaHealthStatus,
} from './common/constants';
import type { TKafkaBrokerEventCallback } from './common/types';

export interface IKafkaBaseOptions<TClient extends Base<BaseOptions>> {
  scope: string;
  identifier: string;
  client: TClient;
  shutdownTimeout?: number;
  onBrokerConnect?: TKafkaBrokerEventCallback;
  onBrokerDisconnect?: TKafkaBrokerEventCallback;
}

/**
 * BaseKafkaHelper — Shared health tracking and broker event wiring
 * for all Kafka helpers (producer, consumer, admin).
 *
 * Generic `TClient` is the platformatic client type (Producer, Consumer, Admin).
 * Subclasses create the client, pass it via `super({ client })`, and access it
 * through `this.client`. Broker events are wired automatically in the constructor.
 */
export abstract class BaseKafkaHelper<TClient extends Base<BaseOptions>> extends BaseHelper {
  protected client: TClient;
  protected readonly shutdownTimeout: number;

  protected healthStatus: TKafkaHealthStatus = KafkaHealthStatuses.UNKNOWN;

  /** Per-broker connection state. Key = "host:port" */
  private readonly connectedBrokers = new Set<string>();

  private readonly onBrokerConnect?: TKafkaBrokerEventCallback;
  private readonly onBrokerDisconnect?: TKafkaBrokerEventCallback;

  constructor(opts: IKafkaBaseOptions<TClient>) {
    super({ scope: opts.scope, identifier: opts.identifier });
    this.client = opts.client;
    this.shutdownTimeout = opts.shutdownTimeout ?? KafkaDefaults.SHUTDOWN_TIMEOUT;
    this.onBrokerConnect = opts.onBrokerConnect;
    this.onBrokerDisconnect = opts.onBrokerDisconnect;
  }

  isHealthy(): boolean {
    return this.connectedBrokers.size > 0;
  }

  isReady(): boolean {
    return this.healthStatus === KafkaHealthStatuses.CONNECTED;
  }

  getHealthStatus(): TKafkaHealthStatus {
    return this.healthStatus;
  }

  getConnectedBrokerCount(): number {
    return this.connectedBrokers.size;
  }

  protected configureBrokerConnect() {
    this.client.on(KafkaClientEvents.BROKER_CONNECT, (payload: ConnectionPoolEventPayload) => {
      const brokerKey = `${payload.broker.host}:${payload.broker.port}`;
      this.connectedBrokers.add(brokerKey);
      this.healthStatus = KafkaHealthStatuses.CONNECTED;

      this.logger.info(
        '[configureBrokerConnect] Broker CONNECTED | Host: %s | Port: %d | Connected: %d',
        payload.broker.host,
        payload.broker.port,
        this.connectedBrokers.size,
      );

      invokeHook({
        logger: this.logger,
        scope: 'configureBrokerConnect',
        execution: () => this.onBrokerConnect?.({ broker: payload.broker }),
      });
    });
  }

  protected configureBrokerDisconnect() {
    this.client.on(KafkaClientEvents.BROKER_DISCONNECT, (payload: ConnectionPoolEventPayload) => {
      const brokerKey = `${payload.broker.host}:${payload.broker.port}`;
      this.connectedBrokers.delete(brokerKey);

      if (this.connectedBrokers.size === 0) {
        this.healthStatus = KafkaHealthStatuses.DISCONNECTED;
      }

      this.logger.warn(
        '[configureBrokerDisconnect] Broker DISCONNECTED | Host: %s | Port: %d | Remaining: %d',
        payload.broker.host,
        payload.broker.port,
        this.connectedBrokers.size,
      );

      invokeHook({
        logger: this.logger,
        scope: 'configureBrokerDisconnect',
        execution: () => this.onBrokerDisconnect?.({ broker: payload.broker }),
      });
    });
  }

  protected configureBrokerFailed() {
    this.client.on(KafkaClientEvents.BROKER_FAILED, (payload: ConnectionPoolEventPayload) => {
      const brokerKey = `${payload.broker.host}:${payload.broker.port}`;
      this.connectedBrokers.delete(brokerKey);

      if (this.connectedBrokers.size === 0) {
        this.healthStatus = KafkaHealthStatuses.DISCONNECTED;
      }

      this.logger.error(
        '[configureBrokerFailed] Broker connection FAILED | Host: %s | Port: %d | Remaining: %d',
        payload.broker.host,
        payload.broker.port,
        this.connectedBrokers.size,
      );
    });
  }

  protected configureBrokerEvents(): void {
    this.configureBrokerConnect();
    this.configureBrokerDisconnect();
    this.configureBrokerFailed();
  }

  protected unconfigureBrokerEvents(): void {
    this.client.removeAllListeners(KafkaClientEvents.BROKER_CONNECT);
    this.client.removeAllListeners(KafkaClientEvents.BROKER_DISCONNECT);
    this.client.removeAllListeners(KafkaClientEvents.BROKER_FAILED);
  }

  protected swapClient(newClient: TClient): void {
    this.unconfigureBrokerEvents();
    this.client = newClient;
    this.resetHealthState();
    this.configureBrokerEvents();
  }

  protected resetHealthState(): void {
    this.connectedBrokers.clear();
    this.healthStatus = KafkaHealthStatuses.DISCONNECTED;
  }

  protected closeClient(): Promise<void> {
    return this.client.close();
  }

  /**
   * Force-close through the callback overload. Only Producer and Consumer expose `close(force, cb)`;
   * the `Base` type this class is generic over declares no such overload, hence the cast.
   */
  protected closeClientWithCallback(): Promise<void> {
    const client = this.client as AnyType;

    return new Promise<void>((resolve, reject) => {
      client.close(true, (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  protected async gracefulCloseClient(): Promise<void> {
    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
      // The timer MUST be cleared once close() wins: an armed shutdownTimeout timer keeps the event
      // loop alive long after a successful shutdown, so the process refuses to exit.
      await Promise.race([
        this.closeClient(),
        new Promise<void>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(getError({ message: '[gracefulCloseClient] Shutdown timed out' })),
            this.shutdownTimeout,
          );
        }),
      ]);
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
