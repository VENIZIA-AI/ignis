import type {
  Deserializers,
  MessagesStreamFallbackModeValue,
  MessagesStreamModeValue,
  SchemaRegistry,
} from '@platformatic/kafka';
import { type TKafkaGroupProtocol } from '../constants';
import {
  type TKafkaBrokerEventCallback,
  type TKafkaGroupJoinCallback,
  type TKafkaGroupLeaveCallback,
  type TKafkaGroupRebalanceCallback,
  type TKafkaHeartbeatErrorCallback,
  type TKafkaLagCallback,
  type TKafkaLagErrorCallback,
  type TKafkaMessageCallback,
  type TKafkaMessageDoneCallback,
  type TKafkaMessageErrorCallback,
  type TKafkaReconnectErrorCallback,
  type TKafkaStreamErrorCallback,
} from './callbacks';
import { type IKafkaConnectionOptions } from './connection';

/** Options for the Kafka consumer helper. `groupId` is required; timeouts and intervals are in milliseconds and `maxBytes` is in bytes, defaulting to {@link KafkaDefaults}. */
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

  onBrokerConnect?: TKafkaBrokerEventCallback;
  onBrokerDisconnect?: TKafkaBrokerEventCallback;

  onMessage?: TKafkaMessageCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
  onMessageDone?: TKafkaMessageDoneCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
  onMessageError?: TKafkaMessageErrorCallback<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
  /** Stream 'error' events; falls back to `onMessageError` when unset. */
  onStreamError?: TKafkaStreamErrorCallback;
  /** Reconnect failures (client rebuild or the reconnect attempt); falls back to `onMessageError` when unset. */
  onReconnectError?: TKafkaReconnectErrorCallback;

  onGroupJoin?: TKafkaGroupJoinCallback;
  onGroupLeave?: TKafkaGroupLeaveCallback;
  onGroupRebalance?: TKafkaGroupRebalanceCallback;
  onHeartbeatError?: TKafkaHeartbeatErrorCallback;

  onLag?: TKafkaLagCallback;
  onLagError?: TKafkaLagErrorCallback;
}

/** Options for starting consumption. `reconnectDelayMs` is in milliseconds; the reconnect values default to {@link KafkaDefaults}. */
export interface IKafkaConsumeStartOptions {
  topics: string[];
  mode?: MessagesStreamModeValue;
  fallbackMode?: MessagesStreamFallbackModeValue;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}
