import { ValueOrPromise } from '@/common/types';
import type {
  Broker,
  Consumer,
  Message,
  Offsets,
  ProduceResult,
  Producer,
  SendOptions,
} from '@platformatic/kafka';

export type TKafkaBrokerEventCallback = (opts: { broker: Broker }) => ValueOrPromise<void>;

export type TKafkaMessageCallback<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> = (opts: {
  message: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => ValueOrPromise<void>;

export type TKafkaMessageDoneCallback<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> = (opts: {
  message: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => ValueOrPromise<void>;

export type TKafkaMessageErrorCallback<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> = (opts: {
  error: Error;
  message?: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => ValueOrPromise<void>;

export type TKafkaGroupJoinCallback = (opts: {
  groupId: string;
  memberId: string;
  generationId?: number;
}) => ValueOrPromise<void>;

export type TKafkaGroupLeaveCallback = (opts: {
  groupId: string;
  memberId: string | null;
}) => ValueOrPromise<void>;

export type TKafkaGroupRebalanceCallback = (opts: { groupId: string }) => ValueOrPromise<void>;

export type TKafkaHeartbeatErrorCallback = (opts: {
  error: Error;
  groupId?: string;
  memberId?: string | null;
}) => ValueOrPromise<void>;

export type TKafkaLagCallback = (opts: { lag: Offsets }) => ValueOrPromise<void>;

export type TKafkaLagErrorCallback = (opts: { error: Error }) => ValueOrPromise<void>;

export type TKafkaTransactionCallback<
  ResultType,
  KeyType,
  ValueType,
  HeaderKeyType,
  HeaderValueType,
> = (
  ctx: IKafkaTransactionContext<KeyType, ValueType, HeaderKeyType, HeaderValueType>,
) => Promise<ResultType>;

export interface IKafkaTransactionContext<KeyType, ValueType, HeaderKeyType, HeaderValueType> {
  transaction: Awaited<
    ReturnType<Producer<KeyType, ValueType, HeaderKeyType, HeaderValueType>['beginTransaction']>
  >;
  send: (
    opts: SendOptions<KeyType, ValueType, HeaderKeyType, HeaderValueType>,
  ) => Promise<ProduceResult>;
  addConsumer: <ConsumerKeyType, ConsumerValueType, ConsumerHeaderKeyType, ConsumerHeaderValueType>(
    consumer: Consumer<
      ConsumerKeyType,
      ConsumerValueType,
      ConsumerHeaderKeyType,
      ConsumerHeaderValueType
    >,
  ) => Promise<void>;
  addOffset: <MessageKeyType, MessageValueType, MessageHeaderKeyType, MessageHeaderValueType>(
    message: Message<
      MessageKeyType,
      MessageValueType,
      MessageHeaderKeyType,
      MessageHeaderValueType
    >,
  ) => Promise<void>;
}
