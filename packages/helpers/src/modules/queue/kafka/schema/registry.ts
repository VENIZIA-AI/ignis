import type { Deserializers, Serializers } from '@platformatic/kafka';
import { ConfluentSchemaRegistry } from '@platformatic/kafka';
import { BaseHelper } from '@venizia/ignis-helpers';
import type { IKafkaSchemaRegistryOptions } from '../common/types';

/**
 * KafkaSchemaRegistryHelper — Wrapper around `@platformatic/kafka` ConfluentSchemaRegistry.
 *
 * Provides scoped logging and exposes the registry for use with producer/consumer helpers.
 *
 * @example
 * const schemaRegistry = KafkaSchemaRegistryHelper.newInstance({
 *   url: 'http://localhost:8081',
 * });
 *
 * const producer = KafkaProducerHelper.newInstance({
 *   bootstrapBrokers: ['127.0.0.1:29092'],
 *   clientId: 'my-producer',
 *   registry: schemaRegistry.getRegistry(),
 * });
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
