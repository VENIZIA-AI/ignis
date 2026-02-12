import {
  Admin,
  AdminConfig,
  ITopicConfig,
  ResourceConfigQuery,
  IResourceConfig,
  SeekEntry,
  ITopicMetadata,
  ITopicPartitionConfig,
  GroupDescriptions,
  DeleteGroupsResult,
  DescribeConfigResponse,
} from 'kafkajs';
import { BaseKafkaHelper } from './base.helper';
import { IKafkaAdminOpts, KafkaHelperRoles } from './types';
import { getError } from '@/helpers/error';

/**
 * KafkaAdminHelper - Kafka Admin Client Helper
 *
 * Provides administrative operations for Kafka cluster management including:
 * - Topic management (create, delete, list, fetch metadata)
 * - Partition management (increase partition count)
 * - Consumer group operations (offsets, describe, delete)
 * - Configuration management (describe, alter)
 *
 * @example
 * ```typescript
 * import { Kafka } from 'kafkajs';
 * import { KafkaAdminHelper } from '@nx/commerce';
 *
 * const kafka = new Kafka({
 *   clientId: 'my-app',
 *   brokers: ['localhost:9092']
 * });
 *
 * const adminHelper = new KafkaAdminHelper({
 *   kafka,
 *   role: KafkaHelperRoles.ROLE_ADMIN,
 *   identifier: 'my-admin',
 *   adminConfig: { retry: { retries: 5 } }
 * });
 *
 * // Connect admin
 * await adminHelper.connectAdmin();
 *
 * // Create topics
 * await adminHelper.createTopics({
 *   topics: [{
 *     topic: 'my-topic',
 *     numPartitions: 3,
 *     replicationFactor: 1
 *   }]
 * });
 *
 * // Increase partitions for existing topic
 * await adminHelper.createPartitions({
 *   topicPartitions: [{
 *     topic: 'my-topic',
 *     count: 5  // increase from 3 to 5 partitions
 *   }]
 * });
 *
 * // Fetch topic metadata
 * const metadata = await adminHelper.fetchTopicMetadata({ topics: ['my-topic'] });
 *
 * // Disconnect when done
 * await adminHelper.disconnectAdmin();
 * ```
 */
export class KafkaAdminHelper extends BaseKafkaHelper {
  private admin: Admin;
  private adminConfig?: AdminConfig;

  private onAdminConnect?: () => void;
  private onAdminDisconnect?: () => void;

  constructor(opts: IKafkaAdminOpts) {
    super({
      ...opts,
      scope: KafkaAdminHelper.name,
      role: KafkaHelperRoles.ROLE_ADMIN,
    });

    this.setupAdmin(opts);
    this.configureAdmin();
  }

  static newInstance(opts: IKafkaAdminOpts) {
    return new KafkaAdminHelper(opts);
  }

  protected setupAdmin(opts: IKafkaAdminOpts) {
    this.adminConfig = opts.adminConfig;
    this.onAdminConnect = opts.onAdminConnect;
    this.onAdminDisconnect = opts.onAdminDisconnect;
  }

  protected configureAdmin() {
    this.admin = this.kafka.admin(this.adminConfig);
    const { CONNECT, DISCONNECT, REQUEST_TIMEOUT } = this.admin.events;

    this.admin.on(CONNECT, () => {
      this.logger.for('[Admin][Connect]').info('Admin CONNECTED | ID: %s', this.identifier);
      this.onAdminConnect?.();
    });

    this.admin.on(DISCONNECT, () => {
      this.logger.for('[Admin][Disconnect]').info('Admin DISCONNECTED | ID: %s', this.identifier);
      this.onAdminDisconnect?.();
    });

    this.admin.on(REQUEST_TIMEOUT, payload => {
      this.logger
        .for('[Admin][RequestTimeout]')
        .warn('Admin request timeout | Payload: %j | ID: %s', payload, this.identifier);
    });
  }

  async connectAdmin() {
    if (!this.admin) {
      this.logger
        .for(this.connectAdmin.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }
    await this.admin.connect();
  }

  async disconnectAdmin() {
    if (!this.admin) {
      this.logger
        .for(this.disconnectAdmin.name)
        .warn('No admin to disconnect | ID: %s', this.identifier);
      return;
    }
    await this.admin.disconnect();
  }

  /**
   * List all topics in the cluster.
   * Returns an array of topic names.
   */
  async listTopics(): Promise<string[]> {
    if (!this.admin) {
      this.logger.for(this.listTopics.name).error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      const topics = await this.admin.listTopics();
      this.logger
        .for(this.listTopics.name)
        .info('Topics listed | Count: %d | ID: %s', topics.length, this.identifier);
      return topics;
    } catch (error) {
      this.logger
        .for(this.listTopics.name)
        .error('Failed to list topics | Error: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  /**
   * Create one or more topics.
   * Returns true if topics were created successfully, false if they already exist.
   */
  async createTopics(opts: {
    validateOnly?: boolean;
    waitForLeaders?: boolean;
    timeout?: number;
    topics: ITopicConfig[];
  }): Promise<boolean> {
    if (!this.admin) {
      this.logger
        .for(this.createTopics.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      const success = await this.admin.createTopics(opts);
      this.logger
        .for(this.createTopics.name)
        .info(
          'Topics created | Result: %s | Count: %d | ID: %s',
          success,
          opts.topics.length,
          this.identifier,
        );
      return success;
    } catch (error) {
      this.logger.for(this.createTopics.name).error(
        'Failed to create topics | Topics: %j | Error: %s | ID: %s',
        opts.topics.map(t => t.topic),
        error,
        this.identifier,
      );
      throw error;
    }
  }

  /**
   * Delete one or more topics.
   * Note: Topic deletion must be enabled on the broker (delete.topic.enable=true).
   */
  async deleteTopics(opts: { topics: string[]; timeout?: number }): Promise<void> {
    if (!this.admin) {
      this.logger
        .for(this.deleteTopics.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      await this.admin.deleteTopics(opts);
      this.logger
        .for(this.deleteTopics.name)
        .info('Topics deleted | Topics: %j | ID: %s', opts.topics, this.identifier);
    } catch (error) {
      this.logger
        .for(this.deleteTopics.name)
        .error(
          'Failed to delete topics | Topics: %j | Error: %s | ID: %s',
          opts.topics,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  /**
   * Fetch metadata for specific topics or all topics if none specified.
   */
  async fetchTopicMetadata(opts?: { topics?: string[] }): Promise<{ topics: ITopicMetadata[] }> {
    if (!this.admin) {
      this.logger
        .for(this.fetchTopicMetadata.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      // Convert optional topics to required format for kafkajs
      const metadata = opts?.topics
        ? await this.admin.fetchTopicMetadata({ topics: opts.topics })
        : await this.admin.fetchTopicMetadata();
      this.logger
        .for(this.fetchTopicMetadata.name)
        .info(
          'Topic metadata fetched | Topics: %d | ID: %s',
          metadata.topics.length,
          this.identifier,
        );
      return metadata;
    } catch (error) {
      this.logger
        .for(this.fetchTopicMetadata.name)
        .error(
          'Failed to fetch topic metadata | Topics: %j | Error: %s | ID: %s',
          opts?.topics,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  /**
   * Fetch the most recent offset for a topic's partitions.
   * Returns array of partition offsets with high/low watermarks.
   */
  async fetchTopicOffsets(
    topic: string,
  ): Promise<Array<{ partition: number; offset: string; high: string; low: string }>> {
    if (!this.admin) {
      this.logger
        .for(this.fetchTopicOffsets.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      const offsets = await this.admin.fetchTopicOffsets(topic);
      this.logger
        .for(this.fetchTopicOffsets.name)
        .info(
          'Topic offsets fetched | Topic: %s | Partitions: %d | ID: %s',
          topic,
          offsets.length,
          this.identifier,
        );
      return offsets;
    } catch (error) {
      this.logger
        .for(this.fetchTopicOffsets.name)
        .error(
          'Failed to fetch topic offsets | Topic: %s | Error: %s | ID: %s',
          topic,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  /**
   * Fetch consumer group offsets for topics.
   */
  async fetchOffsets(opts: {
    groupId: string;
    topics?: string[];
    resolveOffsets?: boolean;
  }): Promise<Array<{ topic: string; partitions: Array<{ partition: number; offset: string }> }>> {
    if (!this.admin) {
      this.logger
        .for(this.fetchOffsets.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      const offsets = await this.admin.fetchOffsets(opts);
      this.logger
        .for(this.fetchOffsets.name)
        .info(
          'Consumer group offsets fetched | GroupId: %s | Topics: %d | ID: %s',
          opts.groupId,
          offsets.length,
          this.identifier,
        );
      return offsets;
    } catch (error) {
      this.logger
        .for(this.fetchOffsets.name)
        .error(
          'Failed to fetch offsets | GroupId: %s | Topics: %j | Error: %s | ID: %s',
          opts.groupId,
          opts.topics,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  /**
   * Reset consumer group offsets to earliest or latest.
   * Consumer group must not have running instances.
   */
  async resetOffsets(opts: { groupId: string; topic: string; earliest: boolean }): Promise<void> {
    if (!this.admin) {
      this.logger
        .for(this.resetOffsets.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      await this.admin.resetOffsets(opts);
      this.logger
        .for(this.resetOffsets.name)
        .info(
          'Offsets reset | GroupId: %s | Topic: %s | Earliest: %s | ID: %s',
          opts.groupId,
          opts.topic,
          opts.earliest,
          this.identifier,
        );
    } catch (error) {
      this.logger
        .for(this.resetOffsets.name)
        .error(
          'Failed to reset offsets | GroupId: %s | Topic: %s | Error: %s | ID: %s',
          opts.groupId,
          opts.topic,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  /**
   * Set consumer group offsets to specific values.
   */
  async setOffsets(opts: {
    groupId: string;
    topic: string;
    partitions: SeekEntry[];
  }): Promise<void> {
    if (!this.admin) {
      this.logger.for(this.setOffsets.name).error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      await this.admin.setOffsets(opts);
      this.logger
        .for(this.setOffsets.name)
        .info(
          'Offsets set | GroupId: %s | Topic: %s | Partitions: %d | ID: %s',
          opts.groupId,
          opts.topic,
          opts.partitions.length,
          this.identifier,
        );
    } catch (error) {
      this.logger
        .for(this.setOffsets.name)
        .error(
          'Failed to set offsets | GroupId: %s | Topic: %s | Error: %s | ID: %s',
          opts.groupId,
          opts.topic,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  /**
   * Increase the number of partitions for existing topics.
   * Note: Kafka does not support decreasing partition count.
   */
  async createPartitions(opts: {
    validateOnly?: boolean;
    timeout?: number;
    topicPartitions: ITopicPartitionConfig[];
  }): Promise<void> {
    if (!this.admin) {
      this.logger
        .for(this.createPartitions.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      await this.admin.createPartitions(opts);
      this.logger.for(this.createPartitions.name).info(
        'Partitions created | Topics: %j | ID: %s',
        opts.topicPartitions.map(tp => ({ topic: tp.topic, count: tp.count })),
        this.identifier,
      );
    } catch (error) {
      this.logger.for(this.createPartitions.name).error(
        'Failed to create partitions | Topics: %j | Error: %s | ID: %s',
        opts.topicPartitions.map(tp => tp.topic),
        error,
        this.identifier,
      );
      throw error;
    }
  }

  /**
   * Describe resource configurations (topics, brokers, etc.).
   */
  async describeConfigs(opts: {
    includeSynonyms: boolean;
    resources: ResourceConfigQuery[];
  }): Promise<DescribeConfigResponse> {
    if (!this.admin) {
      this.logger
        .for(this.describeConfigs.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      const result = await this.admin.describeConfigs(opts);
      this.logger
        .for(this.describeConfigs.name)
        .info('Configs described | Resources: %d | ID: %s', opts.resources.length, this.identifier);
      return result;
    } catch (error) {
      this.logger.for(this.describeConfigs.name).error(
        'Failed to describe configs | Resources: %j | Error: %s | ID: %s',
        opts.resources.map(r => r.name),
        error,
        this.identifier,
      );
      throw error;
    }
  }

  /**
   * Alter resource configurations (topics, brokers, etc.).
   */
  async alterConfigs(opts: { validateOnly: boolean; resources: IResourceConfig[] }): Promise<any> {
    if (!this.admin) {
      this.logger
        .for(this.alterConfigs.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      const result = await this.admin.alterConfigs(opts);
      this.logger
        .for(this.alterConfigs.name)
        .info('Configs altered | Resources: %d | ID: %s', opts.resources.length, this.identifier);
      return result;
    } catch (error) {
      this.logger.for(this.alterConfigs.name).error(
        'Failed to alter configs | Resources: %j | Error: %s | ID: %s',
        opts.resources.map(r => r.name),
        error,
        this.identifier,
      );
      throw error;
    }
  }

  /**
   * List all consumer groups in the cluster.
   */
  async listGroups(): Promise<{
    groups: Array<{ groupId: string; protocolType: string }>;
  }> {
    if (!this.admin) {
      this.logger.for(this.listGroups.name).error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      const result = await this.admin.listGroups();
      this.logger
        .for(this.listGroups.name)
        .info('Groups listed | Count: %d | ID: %s', result.groups.length, this.identifier);
      return result;
    } catch (error) {
      this.logger
        .for(this.listGroups.name)
        .error('Failed to list groups | Error: %s | ID: %s', error, this.identifier);
      throw error;
    }
  }

  /**
   * Describe consumer group details.
   */
  async describeGroups(groupIds: string[]): Promise<GroupDescriptions> {
    if (!this.admin) {
      this.logger
        .for(this.describeGroups.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      const result = await this.admin.describeGroups(groupIds);
      this.logger
        .for(this.describeGroups.name)
        .info('Groups described | GroupIds: %j | ID: %s', groupIds, this.identifier);
      return result;
    } catch (error) {
      this.logger
        .for(this.describeGroups.name)
        .error(
          'Failed to describe groups | GroupIds: %j | Error: %s | ID: %s',
          groupIds,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  /**
   * Delete consumer groups.
   * Groups must be empty (no active members).
   */
  async deleteGroups(groupIds: string[]): Promise<DeleteGroupsResult[]> {
    if (!this.admin) {
      this.logger
        .for(this.deleteGroups.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      const result = await this.admin.deleteGroups(groupIds);
      this.logger
        .for(this.deleteGroups.name)
        .info('Groups deleted | GroupIds: %j | ID: %s', groupIds, this.identifier);
      return result;
    } catch (error) {
      this.logger
        .for(this.deleteGroups.name)
        .error(
          'Failed to delete groups | GroupIds: %j | Error: %s | ID: %s',
          groupIds,
          error,
          this.identifier,
        );
      throw error;
    }
  }

  /**
   * Delete records (messages) up to a specified offset for topic partitions.
   */
  async deleteTopicRecords(opts: {
    topic: string;
    partitions: Array<{ partition: number; offset: string }>;
  }): Promise<void> {
    if (!this.admin) {
      this.logger
        .for(this.deleteTopicRecords.name)
        .error('No admin configured | ID: %s', this.identifier);
      throw getError({ message: 'No admin configured' });
    }

    try {
      await this.admin.deleteTopicRecords(opts);
      this.logger
        .for(this.deleteTopicRecords.name)
        .info(
          'Topic records deleted | Topic: %s | Partitions: %d | ID: %s',
          opts.topic,
          opts.partitions.length,
          this.identifier,
        );
    } catch (error) {
      this.logger
        .for(this.deleteTopicRecords.name)
        .error(
          'Failed to delete topic records | Topic: %s | Error: %s | ID: %s',
          opts.topic,
          error,
          this.identifier,
        );
      throw error;
    }
  }
}
