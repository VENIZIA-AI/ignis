import type { ConfluentSchemaRegistryOptions, ConnectionOptions } from '@platformatic/kafka';

export interface IKafkaConnectionOptions extends ConnectionOptions {
  bootstrapBrokers: string[];
  clientId: string;
  retries?: number;
  retryDelay?: number;
}

export interface IKafkaSchemaRegistryOptions extends ConfluentSchemaRegistryOptions {
  identifier?: string;
}
