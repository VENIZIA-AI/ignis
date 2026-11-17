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

/** Options for the Kafka consumer helper. `groupId` is required; timeouts and intervals are in milliseconds and `maxBytes` is in bytes. */
export interface IKafkaConsumerOptions<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends IKafkaConnectionOptions {
  groupId: string;
  identifier?: string;
  deserializers?: Partial<Deserializers<KeyType, ValueType, HeaderKeyType, HeaderValueType>>;
  /**
   * Automatic offset commit: a boolean, or a number that sets the commit interval.
   * @default KafkaDefaults.AUTOCOMMIT
   */
  autocommit?: boolean | number;
  /**
   * Milliseconds without a heartbeat before the broker drops the member from the group.
   * @default KafkaDefaults.SESSION_TIMEOUT
   */
  sessionTimeout?: number;
  /**
   * Milliseconds between heartbeats to the group coordinator.
   * @default KafkaDefaults.HEARTBEAT_INTERVAL
   */
  heartbeatInterval?: number;
  /**
   * How long the group waits for members to rejoin on a rebalance.
   * @default the `sessionTimeout` in effect
   */
  rebalanceTimeout?: number;
  /**
   * Messages the consume stream buffers before it applies backpressure.
   * @default KafkaDefaults.HIGH_WATER_MARK
   */
  highWaterMark?: number;
  /**
   * Fewest bytes a fetch waits for before it returns.
   * @default KafkaDefaults.MIN_BYTES
   */
  minBytes?: number;
  /**
   * Most bytes a fetch returns.
   * @default KafkaDefaults.MAX_BYTES
   */
  maxBytes?: number;
  /**
   * Milliseconds a fetch waits for `minBytes` before it returns anyway.
   * @default KafkaDefaults.MAX_WAIT_TIME
   */
  maxWaitTime?: number;
  /**
   * Milliseconds before the cluster metadata is refreshed.
   * @default KafkaDefaults.METADATA_MAX_AGE
   */
  metadataMaxAge?: number;
  /**
   * The consumer group protocol.
   * @default KafkaDefaults.GROUP_PROTOCOL
   */
  groupProtocol?: TKafkaGroupProtocol;
  groupInstanceId?: string;
  /**
   * Milliseconds the helper waits for in-flight work on shutdown.
   * @default KafkaDefaults.SHUTDOWN_TIMEOUT
   */
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

/** Options for starting consumption. `reconnectDelayMs` is in milliseconds. */
export interface IKafkaConsumeStartOptions {
  topics: string[];
  /**
   * Where a new consume stream starts reading.
   * @default KafkaDefaults.CONSUME_MODE
   */
  mode?: MessagesStreamModeValue;
  /**
   * Where the stream starts when `mode` finds no committed offset.
   * @default KafkaDefaults.CONSUME_FALLBACK_MODE
   */
  fallbackMode?: MessagesStreamFallbackModeValue;
  /**
   * Milliseconds between reconnect attempts.
   * @default KafkaDefaults.RECONNECT_DELAY
   */
  reconnectDelayMs?: number;
  /**
   * Reconnect attempts before the consume loop gives up.
   * @default KafkaDefaults.MAX_RECONNECT_ATTEMPTS
   */
  maxReconnectAttempts?: number;
}
