import type { CompressionAlgorithmValue, SchemaRegistry, Serializers } from '@platformatic/kafka';
import { TKafkaAcks } from '../constants';
import { TKafkaBrokerEventCallback } from './callbacks';
import { IKafkaConnectionOptions } from './connection';

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
