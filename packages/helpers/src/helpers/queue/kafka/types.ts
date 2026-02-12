import { TConstValue } from '@/common/types';
import {
  AdminConfig,
  ConsumerConfig,
  EachBatchPayload,
  EachMessagePayload,
  Kafka,
  ProducerConfig,
} from 'kafkajs';

export class KafkaHelperRoles {
  static readonly ROLE_CONSUMER = 'consumer';
  static readonly ROLE_PRODUCER = 'producer';
  static readonly ROLE_ADMIN = 'admin';

  static readonly SCHEME_SET = new Set([this.ROLE_ADMIN, this.ROLE_CONSUMER, this.ROLE_PRODUCER]);

  static isValid(role: string): role is TConstValue<typeof KafkaHelperRoles> {
    return this.SCHEME_SET.has(role);
  }
}

export interface IBaseKafkaHelperOpts {
  kafka: Kafka;
  role: TConstValue<typeof KafkaHelperRoles>;
  identifier: string;
}

export interface IKafkaConsumerOpts extends IBaseKafkaHelperOpts {
  autoCommit?: boolean;
  fromBeginning?: boolean;
  partitionsConsumedConcurrently?: number;
  role: typeof KafkaHelperRoles.ROLE_CONSUMER;
  consumerConfig: ConsumerConfig;
  onConsumerConnect?: () => void;
  onConsumerDisconnect?: () => void;
  onMessage?: (payload: EachMessagePayload) => Promise<void>;
  onBatch?: (payload: EachBatchPayload) => Promise<void>;
  onConsumerCrash?: (payload: { error: Error; groupId: string }) => void;
  onConsumerGroupJoin?: (payload: { groupId: string; memberId: string }) => void;
  // TODO: [DLQ] Add optional DLQ configuration
  // dlqProducer?: KafkaProducerHelper;
  // dlqTopic?: string;
}

export interface IKafkaProducerOpts extends IBaseKafkaHelperOpts {
  role: typeof KafkaHelperRoles.ROLE_PRODUCER;
  producerConfig: ProducerConfig;
  onProducerConnect?: () => void;
  onProducerDisconnect?: () => void;
}

export interface IKafkaAdminOpts extends IBaseKafkaHelperOpts {
  role: typeof KafkaHelperRoles.ROLE_ADMIN;
  adminConfig?: AdminConfig;
  onAdminConnect?: () => void;
  onAdminDisconnect?: () => void;
}
