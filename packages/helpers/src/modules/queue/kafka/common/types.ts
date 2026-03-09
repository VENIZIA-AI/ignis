import { ValueOrPromise } from '@/common/types';
import type { Deserializers, Serializers } from '@platformatic/kafka';

export interface IKafkaConnectionOptions {
  clientId?: string;
  bootstrapBrokers: string[];
  timeout?: number;
  retries?: number | boolean;
  retryDelay?: number;
}

export interface IKafkaProducerOptions<
  Key = unknown,
  Value = unknown,
  HeaderKey = unknown,
  HeaderValue = unknown,
> extends IKafkaConnectionOptions {
  identifier?: string;
  acks?: number;
  autocreateTopics?: boolean;
  serializers?: Partial<Serializers<Key, Value, HeaderKey, HeaderValue>>;
  onError?: (opts: { error: Error }) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export interface IKafkaProduceMessage {
  topic: string;
  key?: unknown;
  value?: unknown;
  partition?: number;
  headers?: Record<string, unknown> | Map<unknown, unknown>;
}

export interface IKafkaSendOptions {
  messages: IKafkaProduceMessage[];
  acks?: number;
}

export interface IKafkaConsumerOptions<
  Key = unknown,
  Value = unknown,
  HeaderKey = unknown,
  HeaderValue = unknown,
> extends IKafkaConnectionOptions {
  identifier?: string;
  groupId: string;
  topics: string[];
  deserializers?: Partial<Deserializers<Key, Value, HeaderKey, HeaderValue>>;
  autocommit?: boolean | number;
  sessionTimeout?: number;
  heartbeatInterval?: number;
  highWaterMark?: number;
  maxWaitTime?: number;
  mode?: 'latest' | 'earliest' | 'committed';
  onMessage?: (opts: { message: IKafkaConsumedMessage }) => ValueOrPromise<void>;
  onError?: (opts: { error: Error }) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onGroupJoin?: (opts: { groupId: string; memberId: string }) => void;
  onGroupLeave?: () => void;
  onRebalance?: () => void;
  onLag?: (opts: { offsets: Map<string, bigint[]> }) => void;
}

export interface IKafkaConsumedMessage {
  topic: string;
  partition: number;
  key: unknown;
  value: unknown;
  offset: bigint;
  timestamp: bigint;
  headers: Map<unknown, unknown>;
  commit: (callback?: (error?: Error) => void) => void | Promise<void>;
}

export interface IKafkaAdminOptions extends IKafkaConnectionOptions {
  identifier?: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export interface IKafkaCreateTopicsOptions {
  topics: string[];
  partitions?: number;
  replicas?: number;
}

export interface IKafkaDeleteTopicsOptions {
  topics: string[];
}

export interface IKafkaListTopicsOptions {
  includeInternals?: boolean;
}

export interface IKafkaCommitOptions {
  offsets: Array<{ topic: string; partition: number; offset: bigint; leaderEpoch: number }>;
}

export interface IKafkaListGroupsOptions {
  states?: string[];
}

export interface IKafkaDescribeGroupsOptions {
  groups: string[];
}

export interface IKafkaDeleteGroupsOptions {
  groups: string[];
}

export interface IKafkaListGroupOffsetsOptions {
  groups: string[];
}

export interface IKafkaAlterGroupOffsetsOptions {
  groupId: string;
  topics: Array<{ name: string; partitionOffsets: Array<{ partition: number; offset: bigint }> }>;
}

export interface IKafkaCreatePartitionsOptions {
  topics: Array<{ name: string; count: number }>;
  validateOnly?: boolean;
}

export interface IKafkaDescribeConfigsOptions {
  resources: Array<{
    resourceType: number;
    resourceName: string;
    configurationKeys?: string[];
  }>;
  includeSynonyms?: boolean;
  includeDocumentation?: boolean;
}

export interface IKafkaAlterConfigsOptions {
  resources: Array<{
    resourceType: number;
    resourceName: string;
    configs: Array<{ name: string; value: string }>;
  }>;
  validateOnly?: boolean;
}
