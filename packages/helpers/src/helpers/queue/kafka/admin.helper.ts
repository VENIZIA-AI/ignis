import { BaseHelper } from '@/helpers/base';
import { Admin } from '@platformatic/kafka';
import { KafkaDefaults } from './common';
import {
  type IKafkaAdminOptions,
  type IKafkaCreateTopicsOptions,
  type IKafkaDeleteTopicsOptions,
  type IKafkaListTopicsOptions,
} from './common/types';

export class KafkaAdminHelper extends BaseHelper {
  private admin: Admin;

  constructor(opts: IKafkaAdminOptions) {
    super({ scope: KafkaAdminHelper.name, identifier: opts.identifier });

    this.admin = new Admin({
      clientId: opts.clientId ?? KafkaDefaults.CLIENT_ID,
      bootstrapBrokers: opts.bootstrapBrokers,
      timeout: opts.timeout,
      retries: opts.retries,
      retryDelay: opts.retryDelay,
    });

    this.logger.for('constructor').info('Admin initialized | ID: %s', this.identifier);
  }

  static newInstance(opts: IKafkaAdminOptions) {
    return new KafkaAdminHelper(opts);
  }

  async createTopics(opts: IKafkaCreateTopicsOptions) {
    try {
      const result = await this.admin.createTopics({
        topics: opts.topics,
        partitions: opts.partitions,
        replicas: opts.replicas,
      });

      this.logger
        .for(this.createTopics.name)
        .info('Created topics: %j | ID: %s', opts.topics, this.identifier);

      return result;
    } catch (error) {
      this.logger
        .for(this.createTopics.name)
        .error('Failed to create topics: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async deleteTopics(opts: IKafkaDeleteTopicsOptions): Promise<void> {
    try {
      await this.admin.deleteTopics({ topics: opts.topics });
      this.logger
        .for(this.deleteTopics.name)
        .info('Deleted topics: %j | ID: %s', opts.topics, this.identifier);
    } catch (error) {
      this.logger
        .for(this.deleteTopics.name)
        .error('Failed to delete topics: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async listTopics(opts?: IKafkaListTopicsOptions): Promise<string[]> {
    try {
      return await this.admin.listTopics({
        includeInternals: opts?.includeInternals,
      });
    } catch (error) {
      this.logger
        .for(this.listTopics.name)
        .error('Failed to list topics: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async metadata(opts?: { topics?: string[] }) {
    try {
      return await this.admin.metadata({
        topics: opts?.topics ?? [],
      });
    } catch (error) {
      this.logger
        .for(this.metadata.name)
        .error('Failed to fetch metadata: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      await this.admin?.close();
      this.logger.for(this.close.name).info('Admin closed successfully | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.close.name)
        .error('Error closing admin: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }
}
