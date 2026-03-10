import { BaseHelper } from '@venizia/ignis-helpers';
import { Admin } from '@platformatic/kafka';
import {
  // Option types
  IKafkaAdminOpts,
  ICreateTopicsOpts,
  ICreatePartitionsOpts,
  IListGroupsOpts,
  IDescribeGroupsOpts,
  IListConsumerGroupOffsetsOpts,
  IAlterConsumerGroupOffsetsOpts,
  IDeleteConsumerGroupOffsetsOpts,
  IDescribeConfigsOpts,
  IAlterConfigsOpts,
  IIncrementalAlterConfigsOpts,
  IDescribeClientQuotasOpts,
  IAlterClientQuotasOpts,
  IDescribeLogDirsOpts,
  IListOffsetsOpts,
  IDescribeAclsOpts,
  IDeleteAclsOpts,
  // Response types
  CreatedTopic,
  GroupBase,
  Group,
  ListConsumerGroupOffsetsGroup,
  ConfigDescription,
  BrokerLogDirDescription,
  ListedOffsetsTopic,
  TDescribeAclsResource,
  TDescribeClientQuotasEntry,
  TAlterClientQuotasEntry,
  Acl,
  TKafkaAdmin,
} from './common/types';

/**
 * KafkaAdminHelper — Manage Kafka topics, consumer groups, and configurations.
 *
 * @example
 * // Create an admin instance
 * const admin = KafkaAdminHelper.newInstance({
 *   bootstrapBrokers: ['127.0.0.1:29092'],
 *   clientId: 'nx-search-admin',
 *   identifier: 'search-admin',
 * });
 *
 * // Create topics
 * await admin.createTopics({
 *   topics: ['products-topic', 'inventory-topic'],
 *   partitions: 3,
 *   replicas: 1,
 * });
 *
 * // List all topics
 * const topics = await admin.listTopics(false);
 * console.log('Topics:', topics);
 *
 * // Describe consumer groups
 * const groups = await admin.describeGroups({
 *   groups: ['my-consumer-group'],
 * });
 * console.log('Groups:', groups);
 *
 * // Reset consumer group offsets to earliest
 * await admin.alterConsumerGroupOffsets({
 *   groupId: 'my-consumer-group',
 *   topics: [
 *     {
 *       name: 'products-topic',
 *       partitionOffsets: [
 *         { partition: 0, offset: BigInt(0) },
 *         { partition: 1, offset: BigInt(0) },
 *       ],
 *     },
 *   ],
 * });
 *
 * // List consumer group offsets
 * const offsets = await admin.listConsumerGroupOffsets({
 *   groups: ['my-consumer-group'],
 * });
 * console.log('Offsets:', offsets);
 *
 * // Delete consumer group
 * await admin.deleteGroups({ groups: ['my-consumer-group'] });
 *
 * // Delete topics
 * await admin.deleteTopics({ topics: ['products-topic', 'inventory-topic'] });
 *
 * // Clean up
 * await admin.close();
 */
export class KafkaAdminHelper extends BaseHelper {
  private readonly admin: TKafkaAdmin;

  constructor(opts: IKafkaAdminOpts) {
    super({
      scope: KafkaAdminHelper.name,
      identifier: opts.identifier,
    });

    this.admin = new Admin({
      clientId: opts.clientId,
      bootstrapBrokers: opts.bootstrapBrokers,
      retries: opts.retries,
      retryDelay: opts.retryDelay,
    });
  }

  static newInstance(opts: IKafkaAdminOpts): KafkaAdminHelper {
    return new KafkaAdminHelper(opts);
  }

  // ── Topics ────────────────────────────────────────────────────────────────

  async listTopics(includeInternals = false): Promise<string[]> {
    return this.admin.listTopics({ includeInternals });
  }

  /**
   * Create new Kafka topics with specified partition and replication settings.
   *
   * @example
   * await admin.createTopics({
   *   topics: ['products-index', 'inventory-sync'],
   *   partitions: 3,  // 3 partitions per topic
   *   replicas: 1,    // 1 replica (no redundancy)
   * });
   */
  async createTopics(opts: ICreateTopicsOpts): Promise<CreatedTopic[]> {
    const result = await this.admin.createTopics({
      topics: opts.topics,
      partitions: opts.partitions ?? 1,
      replicas: opts.replicas ?? 1,
      assignments: opts.assignments,
      configs: opts.configs,
    });

    this.logger.info('Created topics | Topics: %j', opts.topics);
    return result;
  }

  async deleteTopics(opts: { topics: string[] }): Promise<void> {
    await this.admin.deleteTopics({ topics: opts.topics });
    this.logger.info('Deleted topics | Topics: %j', opts.topics);
  }

  async createPartitions(opts: ICreatePartitionsOpts): Promise<void> {
    await this.admin.createPartitions({
      topics: opts.topics,
      validateOnly: opts.validateOnly ?? false,
    });
    this.logger.info(
      'Created partitions | Topics: %j',
      opts.topics.map(t => t.name),
    );
  }

  // ── Consumer Groups ───────────────────────────────────────────────────────

  async listGroups(opts?: IListGroupsOpts): Promise<Map<string, GroupBase>> {
    return this.admin.listGroups({
      states: opts?.states,
      types: opts?.types,
    });
  }

  /**
   * Get detailed information about consumer groups (members, state, lag, etc.).
   *
   * @example
   * const groups = await admin.describeGroups({
   *   groups: ['products-consumer', 'inventory-consumer'],
   * });
   * groups.forEach((group, groupId) => {
   *   console.log(`Group: ${groupId}, Members: ${group.members.length}`);
   * });
   */
  async describeGroups(opts: IDescribeGroupsOpts): Promise<Map<string, Group>> {
    return this.admin.describeGroups({
      groups: opts.groups,
      includeAuthorizedOperations: opts.includeAuthorizedOperations ?? false,
    });
  }

  async deleteGroups(opts: { groups: string[] }): Promise<void> {
    await this.admin.deleteGroups({ groups: opts.groups });
    this.logger.info('Deleted groups | Groups: %j', opts.groups);
  }

  async removeMembersFromConsumerGroup(opts: {
    groupId: string;
    members?: Array<{ memberId: string; reason?: string }> | null;
  }): Promise<void> {
    await this.admin.removeMembersFromConsumerGroup({
      groupId: opts.groupId,
      members: opts.members,
    });
    this.logger.info('Removed members | GroupId: %s | Members: %j', opts.groupId, opts.members);
  }

  /**
   * Fetch the current offset positions for a consumer group across all partitions.
   * Use this to monitor lag or reset offsets.
   *
   * @example
   * const offsets = await admin.listConsumerGroupOffsets({
   *   groups: ['products-consumer'],
   * });
   * offsets.forEach(group => {
   *   console.log(`Group: ${group.groupId}`);
   *   group.topics.forEach(topic => {
   *     console.log(`  Topic: ${topic.name}, Partitions:`, topic.partitions);
   *   });
   * });
   */
  async listConsumerGroupOffsets(
    opts: IListConsumerGroupOffsetsOpts,
  ): Promise<ListConsumerGroupOffsetsGroup[]> {
    return this.admin.listConsumerGroupOffsets({
      groups: opts.groups,
      requireStable: opts.requireStable ?? false,
    });
  }

  /**
   * Reset or modify offset positions for a consumer group.
   * Useful for replaying messages or skipping to a specific point.
   *
   * @example
   * // Reset all partitions to offset 0 (replay from beginning)
   * await admin.alterConsumerGroupOffsets({
   *   groupId: 'products-consumer',
   *   topics: [
   *     {
   *       name: 'products-topic',
   *       partitionOffsets: [
   *         { partition: 0, offset: BigInt(0) },
   *         { partition: 1, offset: BigInt(0) },
   *       ],
   *     },
   *   ],
   * });
   */
  async alterConsumerGroupOffsets(opts: IAlterConsumerGroupOffsetsOpts): Promise<void> {
    await this.admin.alterConsumerGroupOffsets({
      groupId: opts.groupId,
      topics: opts.topics.map(t => ({
        name: t.name,
        partitionOffsets: t.partitionOffsets,
      })),
    });
    this.logger.info('Altered consumer group offsets | GroupId: %s', opts.groupId);
  }

  async deleteConsumerGroupOffsets(
    opts: IDeleteConsumerGroupOffsetsOpts,
  ): Promise<Array<{ name: string; partitionIndexes: number[] }>> {
    return this.admin.deleteConsumerGroupOffsets({
      groupId: opts.groupId,
      topics: opts.topics,
    });
  }

  // ── Configs ───────────────────────────────────────────────────────────────

  async describeConfigs(opts: IDescribeConfigsOpts): Promise<ConfigDescription[]> {
    return this.admin.describeConfigs({
      resources: opts.resources,
      includeSynonyms: opts.includeSynonyms ?? false,
      includeDocumentation: opts.includeDocumentation ?? false,
    });
  }

  async alterConfigs(opts: IAlterConfigsOpts): Promise<void> {
    await this.admin.alterConfigs({
      resources: opts.resources,
      validateOnly: opts.validateOnly ?? false,
    });
    this.logger.info(
      'Altered configs | Resources: %j',
      opts.resources.map(r => r.resourceName),
    );
  }

  async incrementalAlterConfigs(opts: IIncrementalAlterConfigsOpts): Promise<void> {
    await this.admin.incrementalAlterConfigs({
      resources: opts.resources,
      validateOnly: opts.validateOnly ?? false,
    });
    this.logger.info(
      'Incremental altered configs | Resources: %j',
      opts.resources.map(r => r.resourceName),
    );
  }

  // ── Client Quotas ─────────────────────────────────────────────────────────

  async describeClientQuotas(
    opts: IDescribeClientQuotasOpts,
  ): Promise<TDescribeClientQuotasEntry[]> {
    return this.admin.describeClientQuotas({
      components: opts.components,
      strict: opts.strict ?? false,
    });
  }

  async alterClientQuotas(opts: IAlterClientQuotasOpts): Promise<TAlterClientQuotasEntry[]> {
    return this.admin.alterClientQuotas({
      entries: opts.entries,
      validateOnly: opts.validateOnly ?? false,
    });
  }

  // ── Log Dirs ──────────────────────────────────────────────────────────────

  async describeLogDirs(opts: IDescribeLogDirsOpts): Promise<BrokerLogDirDescription[]> {
    return this.admin.describeLogDirs({ topics: opts.topics });
  }

  // ── Offsets ───────────────────────────────────────────────────────────────

  async listOffsets(opts: IListOffsetsOpts): Promise<ListedOffsetsTopic[]> {
    return this.admin.listOffsets({
      topics: opts.topics,
      isolationLevel: opts.isolationLevel ?? null,
    });
  }

  // ── ACLs ──────────────────────────────────────────────────────────────────

  async createAcls(opts: { creations: Acl[] }): Promise<void> {
    await this.admin.createAcls({ creations: opts.creations });
    this.logger.info('Created ACLs | Count: %d', opts.creations.length);
  }

  async describeAcls(opts: IDescribeAclsOpts): Promise<TDescribeAclsResource[]> {
    return this.admin.describeAcls({ filter: opts.filter });
  }

  async deleteAcls(opts: IDeleteAclsOpts): Promise<Acl[]> {
    return this.admin.deleteAcls({ filters: opts.filters });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this.admin.close();
    this.logger.info('Admin closed');
  }

  getRawAdmin(): TKafkaAdmin {
    return this.admin;
  }
}
