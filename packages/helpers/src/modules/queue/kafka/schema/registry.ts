import { BaseHelper } from '@/modules/base';
import type { Deserializers, Serializers } from '@platformatic/kafka';
import { ConfluentSchemaRegistry } from '@platformatic/kafka';
import type { IKafkaSchemaRegistryOptions } from '../common/types';

/**
 * Wrapper around `@platformatic/kafka` ConfluentSchemaRegistry; exposes the registry for
 * producer/consumer helpers to share.
 */
export class KafkaSchemaRegistryHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseHelper {
  private readonly registry: ConfluentSchemaRegistry<
    KeyType,
    ValueType,
    HeaderKeyType,
    HeaderValueType
  >;

  constructor(opts: IKafkaSchemaRegistryOptions) {
    super({
      scope: KafkaSchemaRegistryHelper.name,
      identifier: opts.identifier ?? 'kafka-schema-registry',
    });

    this.registry = new ConfluentSchemaRegistry({
      url: opts.url,
      auth: opts.auth,
      protobufTypeMapper: opts.protobufTypeMapper,
      jsonValidateSend: opts.jsonValidateSend,
    });

    this.logger.info('[constructor] Kafka Schema Registry CREATED | URL: %s', opts.url);
  }

  static newInstance<
    KeyType = string,
    ValueType = string,
    HeaderKeyType = string,
    HeaderValueType = string,
  >(opts: IKafkaSchemaRegistryOptions) {
    return new KafkaSchemaRegistryHelper<KeyType, ValueType, HeaderKeyType, HeaderValueType>(opts);
  }

  getRegistry(): ConfluentSchemaRegistry<KeyType, ValueType, HeaderKeyType, HeaderValueType> {
    return this.registry;
  }

  getSerializers(): Serializers<KeyType, ValueType, HeaderKeyType, HeaderValueType> {
    return this.registry.getSerializers();
  }

  getDeserializers(): Deserializers<KeyType, ValueType, HeaderKeyType, HeaderValueType> {
    return this.registry.getDeserializers();
  }
}
