import { Admin } from '@platformatic/kafka';
import { BaseKafkaHelper } from './base';
import { KafkaDefaults, KafkaHealthStatuses } from './common/constants';
import type { IKafkaAdminOptions } from './common/types';

/**
 * KafkaAdminHelper — Wrapper around `@platformatic/kafka` Admin.
 *
 * Provides scoped logging, lifecycle management, and health tracking.
 * Use `getAdmin()` to access the full Admin API directly.
 *
 * @example
 * const helper = KafkaAdminHelper.newInstance({
 *   bootstrapBrokers: ['127.0.0.1:29092'],
 *   clientId: 'my-admin',
 *   onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}:${broker.port}`),
 * });
 *
 * const admin = helper.getAdmin();
 * await admin.createTopics({ topics: ['my-topic'], partitions: 3, replicas: 1 });
 *
 * helper.isHealthy(); // true when connected
 *
 * await helper.close();
 */
export class KafkaAdminHelper extends BaseKafkaHelper<Admin> {
  constructor(opts: IKafkaAdminOptions) {
    super({
      scope: KafkaAdminHelper.name,
      identifier: opts.identifier ?? 'kafka-admin',
      shutdownTimeout: opts.shutdownTimeout,
      client: new Admin({
        clientId: opts.clientId,
        bootstrapBrokers: opts.bootstrapBrokers,
        sasl: opts.sasl,
        tls: opts.tls,
        ssl: opts.ssl,
        connectTimeout: opts.connectTimeout,
        requestTimeout: opts.requestTimeout,
        retries: opts.retries ?? KafkaDefaults.RETRIES,
        retryDelay: opts.retryDelay ?? KafkaDefaults.RETRY_DELAY,
      }),
      onBrokerConnect: opts.onBrokerConnect,
      onBrokerDisconnect: opts.onBrokerDisconnect,
    });

    this.configureBrokerEvents();

    this.logger.info(
      '[constructor] Kafka Admin CREATED | ClientId: %s | Brokers: %j',
      opts.clientId,
      opts.bootstrapBrokers,
    );
  }

  static newInstance(opts: IKafkaAdminOptions): KafkaAdminHelper {
    return new KafkaAdminHelper(opts);
  }

  getAdmin(): Admin {
    return this.client;
  }

  async close(opts?: { isForce?: boolean }): Promise<void> {
    const force = opts?.isForce ?? false;

    if (force) {
      await this.closeClient();
    } else {
      try {
        await this.gracefulCloseClient();
      } catch {
        this.logger.warn('[close] Graceful shutdown timed out, forcing close');
        await this.closeClient();
      }
    }

    this.healthStatus = KafkaHealthStatuses.DISCONNECTED;
    this.logger.info('[close] Admin closed | Force: %s', force);
  }
}
