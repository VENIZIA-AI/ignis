import type {
  MessagesStream,
  CompressionAlgorithmValue,
  Message,
  Admin,
  Consumer,
  Producer,
  BrokerAssignment,
  CreateTopicsOptions,
  CreatePartitionsOptions,
  ListGroupsOptions,
  ConsumerGroupStateValue,
  DescribeClientQuotasOptions,
  AlterClientQuotasOptions,
  DescribeLogDirsOptions,
  DescribeConfigsOptions,
  AlterConfigsOptions,
  IncrementalAlterConfigsOptions,
  DescribeAclsOptions,
  AclFilter,
  DeleteAclsOptions,
  FetchIsolationLevelValue,
  CreatedTopic,
  GroupBase,
  Group,
  ListConsumerGroupOffsetsGroup,
  ConfigDescription,
  BrokerLogDirDescription,
  ListedOffsetsTopic,
  Acl,
} from '@platformatic/kafka';
import { TConstValue } from '@venizia/ignis-helpers';

export type TKafkaStream = MessagesStream<string, string, string, string>;
export type TKafkaMessage = Message<string, string, string, string>;
export type TKafkaConsumer = Consumer<string, string, string, string>;
export type TKafkaProducer = Producer<string, string, string, string>;
export type TKafkaAdmin = Admin;

export type TDescribeAclsResource = Awaited<ReturnType<Admin['describeAcls']>>[number];
export type TDescribeClientQuotasEntry = Awaited<ReturnType<Admin['describeClientQuotas']>>[number];
export type TAlterClientQuotasEntry = Awaited<ReturnType<Admin['alterClientQuotas']>>[number];

export interface IKafkaConsumedMessage {
  topic: string;
  partition: number;
  key: Buffer | null | undefined;
  value: Buffer | null | undefined;
  offset: bigint;
  timestamp: bigint;
  headers: Map<string, string>;
  commit: (callback?: (error?: Error) => void) => void | Promise<void>;
}

export interface IKafkaBaseOpts {
  bootstrapBrokers: string[];
  clientId: string;
  retries?: number;
  retryDelay?: number;
}

export interface IKafkaProducerOpts extends IKafkaBaseOpts {
  identifier?: string;
  compression?: CompressionAlgorithmValue;
  acks?: TKafkaAcks;
  idempotent?: boolean;
  transactionalId?: string;
  strict?: boolean;
  autocreateTopics?: boolean;
}

export interface IKafkaConsumerOpts extends IKafkaBaseOpts {
  groupId: string;
  identifier?: string;
  autocommit?: boolean | number;
  sessionTimeout?: number;
  heartbeatInterval?: number;
  rebalanceTimeout?: number;
  highWaterMark?: number;
  minBytes?: number;
  maxBytes?: number;
  maxWaitTime?: number;
  metadataMaxAge?: number;
  groupProtocol?: TKafkaGroupProtocol;
  groupInstanceId?: string;
}

export interface IKafkaAdminOpts extends IKafkaBaseOpts {
  identifier?: string;
}

export type TKafkaAcks = 0 | 1 | -1;

export class KafkaGroupProtocol {
  static readonly CLASSIC = 'classic';
  static readonly CONSUMER = 'consumer';

  static readonly SCHEME_SET = new Set([this.CLASSIC, this.CONSUMER]);

  static isValid(mode: string): boolean {
    return this.SCHEME_SET.has(mode);
  }
}

export class KafkaConsumeMode {
  static readonly NONE = 'none'; // Used internally by helper to mean "idle"
  static readonly EACH_MESSAGE = 'eachMessage';
  static readonly BATCH_MESSAGES = 'batchMessages';
  static readonly STREAM = 'stream';

  static readonly SCHEME_SET = new Set([
    this.NONE,
    this.EACH_MESSAGE,
    this.BATCH_MESSAGES,
    this.STREAM,
  ]);

  static isValid(mode: string): boolean {
    return this.SCHEME_SET.has(mode);
  }
}

export type TKafkaConsumeMode = TConstValue<typeof KafkaConsumeMode>;

export type TKafkaGroupProtocol = TConstValue<typeof KafkaGroupProtocol>;

export type TKafkaMessageKey = string | Buffer | null | undefined;

export type TKafkaMessageValue = string | Buffer | object | null | undefined;

export type TKafkaMessageHeaders = Record<string, string> | Map<string, string>;

export interface IKafkaMessageOpts {
  key?: TKafkaMessageKey;
  value: TKafkaMessageValue;
  headers?: TKafkaMessageHeaders;
}

export interface IConsumeOpts {
  fromBeginning?: boolean;
  maxFetches?: number;
  /**
   * When true, use MessagesStreamModes.EARLIEST directly instead of COMMITTED+fallback.
   * Use this for ephemeral consumers that must always replay from offset 0 without
   * running the COMMITTED group-offset lifecycle (OffsetFetch → potential re-joins
   * mid-Fetch → ILLEGAL_GENERATION errors on empty topics).
   */
  alwaysFromEarliest?: boolean;
}

export interface IEachMessageOpts extends IConsumeOpts {
  abortSignal?: AbortSignal;
  reconnectDelayMs?: number;
}

export interface IBatchMessagesOpts extends IEachMessageOpts {
  batchSize?: number;
  batchTimeMs?: number;
}

export type { BrokerAssignment };

export interface ICreateTopicsOpts extends CreateTopicsOptions {}

export interface ICreatePartitionsOpts extends CreatePartitionsOptions {}

export interface IListGroupsOpts extends ListGroupsOptions {}

export interface IDescribeGroupsOpts {
  groups: string[];
  includeAuthorizedOperations?: boolean;
}

export interface IListConsumerGroupOffsetsOpts {
  groups: Array<
    | string
    | {
        groupId: string;
        topics?: Array<{ name: string; partitionIndexes: number[] }> | null;
      }
  >;
  requireStable?: boolean;
}

export interface IAlterConsumerGroupOffsetsOpts {
  groupId: string;
  topics: Array<{
    name: string;
    partitionOffsets: Array<{ partition: number; offset: bigint }>;
  }>;
}

export interface IDeleteConsumerGroupOffsetsOpts {
  groupId: string;
  topics: Array<{ name: string; partitionIndexes: number[] }>;
}

export interface IDescribeConfigsOpts extends DescribeConfigsOptions {}

export interface IAlterConfigsOpts extends AlterConfigsOptions {}

export interface IIncrementalAlterConfigsOpts extends IncrementalAlterConfigsOptions {}

export interface IDescribeClientQuotasOpts extends DescribeClientQuotasOptions {}

export interface IAlterClientQuotasOpts extends AlterClientQuotasOptions {}

export interface IDescribeLogDirsOpts extends DescribeLogDirsOptions {}

export interface IListOffsetsOpts {
  topics: Array<{
    name: string;
    partitions: Array<{ partitionIndex: number; timestamp: bigint }>;
  }>;
  isolationLevel?: FetchIsolationLevelValue | null;
}

export interface IDescribeAclsOpts extends DescribeAclsOptions {}

export interface IDeleteAclsOpts extends DeleteAclsOptions {}

export type {
  ConsumerGroupStateValue,
  AclFilter,
  FetchIsolationLevelValue,
  CreatedTopic,
  GroupBase,
  Group,
  ListConsumerGroupOffsetsGroup,
  ConfigDescription,
  BrokerLogDirDescription,
  ListedOffsetsTopic,
  Acl,
};
