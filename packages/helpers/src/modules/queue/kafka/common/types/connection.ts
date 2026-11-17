import type { ConfluentSchemaRegistryOptions, ConnectionOptions } from '@platformatic/kafka';

/** Connection options shared by every Kafka helper. `retryDelay` is in milliseconds. */
export interface IKafkaConnectionOptions extends ConnectionOptions {
  bootstrapBrokers: string[];
  clientId: string;
  retries?: number;
  retryDelay?: number;
}

/** Options for a Confluent schema registry client, with an optional logger `identifier`. */
export interface IKafkaSchemaRegistryOptions extends ConfluentSchemaRegistryOptions {
  identifier?: string;
}
