import { TWebSocketMessageType } from '../constants';

/** Client <-> Server message envelope */
export interface IWebSocketMessage<DataType = unknown> {
  event: string;
  data?: DataType;
  id?: string;
}

/** Internal Redis pub/sub message envelope */
export interface IRedisSocketMessage<DataType = unknown> {
  serverId: string;
  type: TWebSocketMessageType;
  target?: string;
  event: string;
  data: DataType;
  exclude?: string[];
}
