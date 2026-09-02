import { ValueOrPromise } from '@/common/types';
import { TNullable } from '@venizia/ignis-inversion';
import { IWebSocketClient } from './client';
import { IWebSocketMessage } from './message';

export type TWebSocketAuthenticateFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (
  opts: AuthDataType,
) => ValueOrPromise<{ userId?: string; metadata?: MetadataType } | null | false>;

export type TWebSocketHandshakeFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  clientId: string;
  userId?: string;
  data: AuthDataType;
}) => ValueOrPromise<{ serverPublicKey: string; salt: string } | null | false>;

export type TWebSocketValidateRoomFn = (opts: {
  clientId: string;
  userId?: string;
  rooms: string[];
}) => ValueOrPromise<string[]>;

export type TWebSocketClientConnectedFn<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: { clientId: string; userId?: string; metadata?: MetadataType }) => ValueOrPromise<void>;

export type TWebSocketClientDisconnectedFn = (opts: {
  clientId: string;
  userId?: string;
}) => ValueOrPromise<void>;

export type TWebSocketMessageHandler = (opts: {
  clientId: string;
  userId?: string;
  message: IWebSocketMessage;
}) => ValueOrPromise<void>;

export type TWebSocketOutboundTransformer<
  DataType = unknown,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  client: IWebSocketClient<MetadataType>;
  event: string;
  data: DataType;
}) => ValueOrPromise<TNullable<{ event: string; data: DataType }>>;
