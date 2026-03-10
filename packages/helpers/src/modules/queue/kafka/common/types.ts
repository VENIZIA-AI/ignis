import type {
  CompressionAlgorithmValue,
  ConnectionOptions,
  Deserializers,
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
// Producer options
// -------------------------------------------------------------------------

export interface IKafkaProducerOpts<
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
}

// -------------------------------------------------------------------------
// Consumer options
// -------------------------------------------------------------------------

export interface IKafkaConsumerOpts<
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
}

// -------------------------------------------------------------------------
// Admin options
// -------------------------------------------------------------------------

export interface IKafkaAdminOpts extends IKafkaConnectionOptions {
  identifier?: string;
}
