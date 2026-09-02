import type {
  Deserializers,
  MessagesStreamFallbackModeValue,
  MessagesStreamModeValue,
  SchemaRegistry,
} from '@platformatic/kafka';
import { TKafkaGroupProtocol } from '../constants';
import {
  TKafkaBrokerEventCallback,
  TKafkaGroupJoinCallback,
  TKafkaGroupLeaveCallback,
  TKafkaGroupRebalanceCallback,
  TKafkaHeartbeatErrorCallback,
  TKafkaLagCallback,
  TKafkaLagErrorCallback,
  TKafkaMessageCallback,
  TKafkaMessageDoneCallback,
  TKafkaMessageErrorCallback,
} from './callbacks';
import { IKafkaConnectionOptions } from './connection';

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

  onGroupJoin?: TKafkaGroupJoinCallback;
  onGroupLeave?: TKafkaGroupLeaveCallback;
  onGroupRebalance?: TKafkaGroupRebalanceCallback;
  onHeartbeatError?: TKafkaHeartbeatErrorCallback;

  onLag?: TKafkaLagCallback;
  onLagError?: TKafkaLagErrorCallback;
}

export interface IKafkaConsumeStartOptions {
  topics: string[];
  mode?: MessagesStreamModeValue;
  fallbackMode?: MessagesStreamFallbackModeValue;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}
