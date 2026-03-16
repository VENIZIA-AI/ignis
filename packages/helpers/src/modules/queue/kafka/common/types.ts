import { ValueOrPromise } from '@/common/types';
import type {
  Broker,
  CompressionAlgorithmValue,
  ConfluentSchemaRegistryOptions,
  ConnectionOptions,
  Consumer,
  Deserializers,
  Message,
  MessagesStreamFallbackModeValue,
  MessagesStreamModeValue,
  Offsets,
  ProduceResult,
  Producer,
  SchemaRegistry,
  SendOptions,
  Serializers,
} from '@platformatic/kafka';
import { TKafkaAcks, TKafkaGroupProtocol } from './constants';

export interface IKafkaConnectionOptions extends ConnectionOptions {
  bootstrapBrokers: string[];
  clientId: string;
  retries?: number;
  retryDelay?: number;
}

// -------------------------------------------------------------------------
// Callback types
// -------------------------------------------------------------------------

export type TKafkaBrokerEventCallback = (opts: { broker: Broker }) => ValueOrPromise<void>;

export type TKafkaMessageCallback<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> = (opts: {
  message: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => ValueOrPromise<void>;

export type TKafkaMessageDoneCallback<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> = (opts: {
  message: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => ValueOrPromise<void>;

export type TKafkaMessageErrorCallback<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> = (opts: {
  error: Error;
  message?: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => ValueOrPromise<void>;

export type TKafkaGroupJoinCallback = (opts: {
  groupId: string;
  memberId: string;
  generationId?: number;
}) => ValueOrPromise<void>;

export type TKafkaGroupLeaveCallback = (opts: {
  groupId: string;
  memberId: string | null;
}) => ValueOrPromise<void>;

export type TKafkaGroupRebalanceCallback = (opts: { groupId: string }) => ValueOrPromise<void>;

export type TKafkaHeartbeatErrorCallback = (opts: {
  error: Error;
  groupId?: string;
  memberId?: string | null;
}) => ValueOrPromise<void>;

export type TKafkaLagCallback = (opts: { lag: Offsets }) => ValueOrPromise<void>;

export type TKafkaLagErrorCallback = (opts: { error: Error }) => ValueOrPromise<void>;

export type TKafkaTransactionCallback<
  ResultType,
  KeyType,
  ValueType,
  HeaderKeyType,
  HeaderValueType,
> = (
  ctx: IKafkaTransactionContext<KeyType, ValueType, HeaderKeyType, HeaderValueType>,
) => Promise<ResultType>;

// -------------------------------------------------------------------------
// Producer options
// -------------------------------------------------------------------------

export interface IKafkaProducerOptions<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends IKafkaConnectionOptions {
  identifier?: string;
  serializers?: Partial<Serializers<KeyType, ValueType, HeaderKeyType, HeaderValueType>>;
  compression?: CompressionAlgorithmValue;
  acks?: TKafkaAcks;
  idempotent?: boolean;
  transactionalId?: string;
  strict?: boolean;
  autocreateTopics?: boolean;
  shutdownTimeout?: number;
  registry?: SchemaRegistry<unknown, unknown, KeyType, ValueType, HeaderKeyType, HeaderValueType>;
  onBrokerConnect?: TKafkaBrokerEventCallback;
  onBrokerDisconnect?: TKafkaBrokerEventCallback;
}

// -------------------------------------------------------------------------
// Consumer options
// -------------------------------------------------------------------------

export interface IKafkaConsumerOptions<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends IKafkaConnectionOptions {
  groupId: string;
  identifier?: string;
  deserializers?: Partial<Deserializers<KeyType, ValueType, HeaderKeyType, HeaderValueType>>;
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
  shutdownTimeout?: number;
  registry?: SchemaRegistry<unknown, unknown, KeyType, ValueType, HeaderKeyType, HeaderValueType>;

  // Lifecycle callbacks
  onBrokerConnect?: TKafkaBrokerEventCallback;
  onBrokerDisconnect?: TKafkaBrokerEventCallback;

  // Message callbacks
  onMessage?: TKafkaMessageCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
  onMessageDone?: TKafkaMessageDoneCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
  onMessageError?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;

  // Consumer group callbacks
  onGroupJoin?: TKafkaGroupJoinCallback;
  onGroupLeave?: TKafkaGroupLeaveCallback;
  onGroupRebalance?: TKafkaGroupRebalanceCallback;
  onHeartbeatError?: TKafkaHeartbeatErrorCallback;

  // Lag monitoring callbacks
  onLag?: TKafkaLagCallback;
  onLagError?: TKafkaLagErrorCallback;
}

// -------------------------------------------------------------------------
// Admin options
// -------------------------------------------------------------------------

export interface IKafkaAdminOptions extends IKafkaConnectionOptions {
  identifier?: string;
  shutdownTimeout?: number;
  onBrokerConnect?: TKafkaBrokerEventCallback;
  onBrokerDisconnect?: TKafkaBrokerEventCallback;
}

// -------------------------------------------------------------------------
// Consumer start options
// -------------------------------------------------------------------------

export interface IKafkaConsumeStartOptions {
  topics: string[];
  mode?: MessagesStreamModeValue;
  fallbackMode?: MessagesStreamFallbackModeValue;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}

// -------------------------------------------------------------------------
// Transaction context
// -------------------------------------------------------------------------

export interface IKafkaTransactionContext<KeyType, ValueType, HeaderKeyType, HeaderValueType> {
  transaction: Awaited<
    ReturnType<Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType>['beginTransaction']>
  >;
  send: (
    opts: SendOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>,
  ) => Promise<ProduceResult>;
  addConsumer: <ConsumerKeyType, ConsumerValueType, ConsumerHeaderKeyType, ConsumerHeaderValueType>(
    consumer: Consumer<
      ConsumerKeyType,
      ConsumerValueType,
      ConsumerHeaderKeyType,
      ConsumerHeaderValueType
    >,
  ) => Promise<void>;
  addOffset: <MessageKeyType, MessageValueType, MessageHeaderKeyType, MessageHeaderValueType>(
    message: Message<
      MessageKeyType,
      MessageValueType,
      MessageHeaderKeyType,
      MessageHeaderValueType
    >,
  ) => Promise<void>;
}

// -------------------------------------------------------------------------
// Schema registry options
// -------------------------------------------------------------------------

export interface IKafkaSchemaRegistryOptions extends ConfluentSchemaRegistryOptions {
  identifier?: string;
}
