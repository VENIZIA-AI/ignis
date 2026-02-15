import { ValueOrPromise } from '@/common/types';
import type { Deserializers, Serializers } from '@platformatic/kafka';

// -------------------------------------------------------------------------------------------------------------
// Connection Options (shared across Producer / Consumer / Admin)
// -------------------------------------------------------------------------------------------------------------
export interface IKafkaConnectionOptions {
  clientId?: string;
  bootstrapBrokers: string[];
  timeout?: number;
  retries?: number | boolean;
  retryDelay?: number;
}

// -------------------------------------------------------------------------------------------------------------
// Producer
// -------------------------------------------------------------------------------------------------------------
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

// -------------------------------------------------------------------------------------------------------------
// Consumer
// -------------------------------------------------------------------------------------------------------------
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

// -------------------------------------------------------------------------------------------------------------
// Admin
// -------------------------------------------------------------------------------------------------------------
export interface IKafkaAdminOptions extends IKafkaConnectionOptions {
  identifier?: string;
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
