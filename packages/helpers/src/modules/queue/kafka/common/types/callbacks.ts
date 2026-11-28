import { type TValueOrPromise } from '@/common/types';
import type {
  Broker,
  Consumer,
  Message,
  Offsets,
  ProduceResult,
  Producer,
  SendOptions,
} from '@platformatic/kafka';

/** Called when a broker connects or disconnects. */
export type TKafkaBrokerEventCallback = (opts: { broker: Broker }) => TValueOrPromise<void>;

/** Called with each consumed message. */
export type TKafkaMessageCallback<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> = (opts: {
  message: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => TValueOrPromise<void>;

/** Called after a message has been handled. */
export type TKafkaMessageDoneCallback<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> = (opts: {
  message: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => TValueOrPromise<void>;

/** Called when handling fails; `message` is absent when the error is not tied to one message. */
export type TKafkaMessageErrorCallback<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> = (opts: {
  error: Error;
  message?: Message<KeyType, ValueType, HeaderKeyType, HeaderValueType>;
}) => TValueOrPromise<void>;

/** The stream 'error' event - falls back to `onMessageError` when unset. */
export type TKafkaStreamErrorCallback = (opts: { error: Error }) => TValueOrPromise<void>;

/** A reconnect failure (client rebuild or the reconnect attempt itself) - falls back to `onMessageError` when unset. */
export type TKafkaReconnectErrorCallback = (opts: {
  error: Error;
  attempt: number;
  maxAttempts: number;
}) => TValueOrPromise<void>;

/** Called when the consumer joins its group. */
export type TKafkaGroupJoinCallback = (opts: {
  groupId: string;
  memberId: string;
  generationId?: number;
}) => TValueOrPromise<void>;

/** Called when the consumer leaves its group; `memberId` is `null` when it has none. */
export type TKafkaGroupLeaveCallback = (opts: {
  groupId: string;
  memberId: string | null;
}) => TValueOrPromise<void>;

/** Called when the consumer group rebalances. */
export type TKafkaGroupRebalanceCallback = (opts: { groupId: string }) => TValueOrPromise<void>;

/** Called when a group heartbeat fails. */
export type TKafkaHeartbeatErrorCallback = (opts: {
  error: Error;
  groupId?: string;
  memberId?: string | null;
}) => TValueOrPromise<void>;

/** Called with the consumer lag offsets from the lag monitor. */
export type TKafkaLagCallback = (opts: { lag: Offsets }) => TValueOrPromise<void>;

/** Called when the lag monitor fails to read lag. */
export type TKafkaLagErrorCallback = (opts: { error: Error }) => TValueOrPromise<void>;

/** Body of a producer transaction; receives the {@link IKafkaTransactionContext} and resolves to the transaction result. */
export type TKafkaTransactionCallback<
  ResultType,
  KeyType,
  ValueType,
  HeaderKeyType,
  HeaderValueType,
> = (
  ctx: IKafkaTransactionContext<KeyType, ValueType, HeaderKeyType, HeaderValueType>,
) => Promise<ResultType>;

/** Handle passed to a transaction body: the open `transaction`, plus `send`, `addConsumer` and `addOffset` bound to it. */
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
