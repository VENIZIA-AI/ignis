import { TKafkaBrokerEventCallback } from './callbacks';
import { IKafkaConnectionOptions } from './connection';

export interface IKafkaAdminOptions extends IKafkaConnectionOptions {
  identifier?: string;
  shutdownTimeout?: number;
  onBrokerConnect?: TKafkaBrokerEventCallback;
  onBrokerDisconnect?: TKafkaBrokerEventCallback;
}
