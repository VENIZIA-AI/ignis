import { type TKafkaBrokerEventCallback } from './callbacks';
import { type IKafkaConnectionOptions } from './connection';

/** Options for the Kafka admin helper. `shutdownTimeout` is in milliseconds. */
export interface IKafkaAdminOptions extends IKafkaConnectionOptions {
  identifier?: string;
  shutdownTimeout?: number;
  onBrokerConnect?: TKafkaBrokerEventCallback;
  onBrokerDisconnect?: TKafkaBrokerEventCallback;
}
