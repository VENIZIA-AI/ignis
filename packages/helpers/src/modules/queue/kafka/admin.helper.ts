import { Admin } from '@platformatic/kafka';
import { BaseHelper } from '@venizia/ignis-helpers';
import { KafkaDefaults } from './common/constants';
import type { IKafkaAdminOpts } from './common/types';

/**
 * KafkaAdminHelper — Thin wrapper around `@platformatic/kafka` Admin.
 *
 * Provides scoped logging and lifecycle management.
 * Use `getAdmin()` to access the full Admin API directly — no need for passthrough methods.
 *
 * @example
 * const helper = KafkaAdminHelper.newInstance({
 *   bootstrapBrokers: ['127.0.0.1:29092'],
 *   clientId: 'my-admin',
 * });
 *
 * const admin = helper.getAdmin();
 *
 * // Use @platformatic/kafka Admin API directly
 * await admin.createTopics({ topics: ['my-topic'], partitions: 3, replicas: 1 });
 * const topics = await admin.listTopics({ includeInternals: false });
 * const groups = await admin.describeGroups({ groups: ['my-group'] });
 *
 * await helper.close();
 */
export class KafkaAdminHelper extends BaseHelper {
  private readonly admin: Admin;

  constructor(opts: IKafkaAdminOpts) {
    super({
      scope: KafkaAdminHelper.name,
      identifier: opts.identifier ?? 'kafka-admin',
    });

    this.admin = new Admin({
      clientId: opts.clientId,
      bootstrapBrokers: opts.bootstrapBrokers,
      sasl: opts.sasl,
      tls: opts.tls,
      ssl: opts.ssl,
      connectTimeout: opts.connectTimeout,
      requestTimeout: opts.requestTimeout,
      retries: opts.retries ?? KafkaDefaults.RETRIES,
      retryDelay: opts.retryDelay ?? KafkaDefaults.RETRY_DELAY,
    });

    this.logger.info(
      '[constructor] Kafka Admin CREATED | ClientId: %s | Brokers: %j',
      opts.clientId,
      opts.bootstrapBrokers,
    );
  }

  static newInstance(opts: IKafkaAdminOpts): KafkaAdminHelper {
    return new KafkaAdminHelper(opts);
  }

  getAdmin(): Admin {
    return this.admin;
  }

  async close(): Promise<void> {
    await this.admin.close();
    this.logger.info('Admin closed');
  }
}
