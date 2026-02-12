import { Kafka } from 'kafkajs';
import { IBaseKafkaHelperOpts, KafkaHelperRoles } from './types';
import { TConstValue } from '@/common/types';
import { BaseHelper } from '@/helpers/base';

export abstract class BaseKafkaHelper extends BaseHelper {
  protected kafka: Kafka;
  protected role: TConstValue<typeof KafkaHelperRoles>;

  constructor(opts: { scope: string } & IBaseKafkaHelperOpts) {
    const { scope, role, kafka, identifier } = opts;
    super({ scope, identifier });
    this.kafka = kafka;
    this.role = role;
  }
}
