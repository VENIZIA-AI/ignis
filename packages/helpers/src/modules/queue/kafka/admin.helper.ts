import { BaseHelper } from '@/modules/base';
import { Admin } from '@platformatic/kafka';
import { KafkaDefaults } from './common';
import {
  type IKafkaAdminOptions,
  type IKafkaAlterConfigsOptions,
  type IKafkaAlterGroupOffsetsOptions,
  type IKafkaCreatePartitionsOptions,
  type IKafkaCreateTopicsOptions,
  type IKafkaDeleteGroupsOptions,
  type IKafkaDeleteTopicsOptions,
  type IKafkaDescribeConfigsOptions,
  type IKafkaDescribeGroupsOptions,
  type IKafkaListGroupOffsetsOptions,
  type IKafkaListGroupsOptions,
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

    this.wireLifecycleHooks(opts);
    this.logger.for('constructor').info('Admin initialized | ID: %s', this.identifier);
  }

  private wireLifecycleHooks(opts: IKafkaAdminOptions): void {
    if (opts.onConnected) {
      this.admin.on('client:broker:connect', () => {
        try {
          opts.onConnected!();
        } catch (err) {
          this.logger
            .for('onConnected')
            .error('Lifecycle hook error: %s | ID: %s', err, this.identifier);
        }
      });
    }

    if (opts.onDisconnected) {
      this.admin.on('client:broker:disconnect', () => {
        try {
          opts.onDisconnected!();
        } catch (err) {
          this.logger
            .for('onDisconnected')
            .error('Lifecycle hook error: %s | ID: %s', err, this.identifier);
        }
      });
    }
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

  // ---------------------------------------------------------------------------
  // Consumer Group Operations
  // ---------------------------------------------------------------------------

  async listGroups(opts?: IKafkaListGroupsOptions) {
    try {
      const result = await this.admin.listGroups({
        states: opts?.states as any[],
      });

      this.logger
        .for(this.listGroups.name)
        .debug('Listed consumer groups | ID: %s', this.identifier);
      return result;
    } catch (error) {
      this.logger
        .for(this.listGroups.name)
        .error('Failed to list groups: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async describeGroups(opts: IKafkaDescribeGroupsOptions) {
    try {
      const result = await this.admin.describeGroups({ groups: opts.groups });

      this.logger
        .for(this.describeGroups.name)
        .debug('Described groups: %j | ID: %s', opts.groups, this.identifier);
      return result;
    } catch (error) {
      this.logger
        .for(this.describeGroups.name)
        .error('Failed to describe groups: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async deleteGroups(opts: IKafkaDeleteGroupsOptions): Promise<void> {
    try {
      await this.admin.deleteGroups({ groups: opts.groups });

      this.logger
        .for(this.deleteGroups.name)
        .info('Deleted groups: %j | ID: %s', opts.groups, this.identifier);
    } catch (error) {
      this.logger
        .for(this.deleteGroups.name)
        .error('Failed to delete groups: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Offset Management
  // ---------------------------------------------------------------------------

  async listConsumerGroupOffsets(opts: IKafkaListGroupOffsetsOptions) {
    try {
      const result = await this.admin.listConsumerGroupOffsets({ groups: opts.groups });

      this.logger
        .for(this.listConsumerGroupOffsets.name)
        .debug('Listed consumer group offsets | ID: %s', this.identifier);
      return result;
    } catch (error) {
      this.logger
        .for(this.listConsumerGroupOffsets.name)
        .error('Failed to list consumer group offsets: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async alterConsumerGroupOffsets(opts: IKafkaAlterGroupOffsetsOptions): Promise<void> {
    try {
      await this.admin.alterConsumerGroupOffsets({
        groupId: opts.groupId,
        topics: opts.topics.map(t => ({
          name: t.name,
          partitionOffsets: t.partitionOffsets.map(po => ({
            partition: po.partition,
            offset: po.offset,
          })),
        })),
      });

      this.logger
        .for(this.alterConsumerGroupOffsets.name)
        .info('Altered consumer group offsets for %s | ID: %s', opts.groupId, this.identifier);
    } catch (error) {
      this.logger
        .for(this.alterConsumerGroupOffsets.name)
        .error('Failed to alter consumer group offsets: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Partition Management
  // ---------------------------------------------------------------------------

  async createPartitions(opts: IKafkaCreatePartitionsOptions): Promise<void> {
    try {
      await this.admin.createPartitions({
        topics: opts.topics,
        validateOnly: opts.validateOnly,
      });

      this.logger
        .for(this.createPartitions.name)
        .info('Created partitions for topics: %j | ID: %s', opts.topics, this.identifier);
    } catch (error) {
      this.logger
        .for(this.createPartitions.name)
        .error('Failed to create partitions: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Config Management
  // ---------------------------------------------------------------------------

  async describeConfigs(opts: IKafkaDescribeConfigsOptions) {
    try {
      const result = await this.admin.describeConfigs({
        resources: opts.resources as any[],
        includeSynonyms: opts.includeSynonyms,
        includeDocumentation: opts.includeDocumentation,
      });

      this.logger
        .for(this.describeConfigs.name)
        .debug('Described configs | ID: %s', this.identifier);
      return result;
    } catch (error) {
      this.logger
        .for(this.describeConfigs.name)
        .error('Failed to describe configs: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  async alterConfigs(opts: IKafkaAlterConfigsOptions): Promise<void> {
    try {
      await this.admin.alterConfigs({
        resources: opts.resources as any[],
        validateOnly: opts.validateOnly,
      });

      this.logger.for(this.alterConfigs.name).info('Altered configs | ID: %s', this.identifier);
    } catch (error) {
      this.logger
        .for(this.alterConfigs.name)
        .error('Failed to alter configs: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Escape Hatch
  // ---------------------------------------------------------------------------

  getAdmin(): Admin {
    return this.admin;
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
