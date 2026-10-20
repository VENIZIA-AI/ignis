import { type TKafkaBrokerEventCallback } from './callbacks';
import { type IKafkaConnectionOptions } from './connection';

export interface IKafkaAdminOptions extends IKafkaConnectionOptions {
  identifier?: string;
  shutdownTimeout?: number;
  onBrokerConnect?: TKafkaBrokerEventCallback;
  onBrokerDisconnect?: TKafkaBrokerEventCallback;
}
