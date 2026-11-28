import { Admin } from '@platformatic/kafka';
import { BaseKafkaHelper } from './base';
import { KafkaHealthStatuses } from './common/constants';
import type { IKafkaAdminOptions } from './common/types';

/** Wrapper around `@platformatic/kafka` Admin with lifecycle management and health tracking; `getAdmin()` exposes the full Admin API directly. */
export class KafkaAdminHelper extends BaseKafkaHelper<Admin> {
  constructor(opts: IKafkaAdminOptions) {
    super({
      scope: KafkaAdminHelper.name,
      identifier: opts.identifier ?? 'kafka-admin',
      shutdownTimeout: opts.shutdownTimeout,
      client: new Admin({
        ...BaseKafkaHelper.buildConnectionOptions(opts),
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
