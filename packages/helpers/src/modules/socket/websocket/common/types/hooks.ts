import { type ValueOrPromise } from '@/common/types';
import { type TNullable } from '@venizia/ignis-inversion';
import type { z } from 'zod';
import { type IWebSocketClient } from './client';
import { type IWebSocketMessage } from './message';

/** Verifies the data a client sends to authenticate. Resolves `{ userId, metadata }` to accept, or `null` or `false` to reject. */
export type TWebSocketAuthenticateFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (
  opts: AuthDataType,
) => ValueOrPromise<{ userId?: string; metadata?: MetadataType } | null | false>;

/** Authentication checked by a schema: the server refuses what `schema` refuses, and the hooks receive what it answers. */
export interface IWebSocketSchemaAuthOptions<
  AuthDataType extends Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  authenticate: {
    schema: z.ZodType<AuthDataType>;
    fn: TWebSocketAuthenticateFn<AuthDataType, MetadataType>;
  };
  /** Required when `requireEncryption` is true. */
  handshake?: { fn: TWebSocketHandshakeFn<AuthDataType> };
}

/** Authentication without a schema: the hooks receive the object the client sent. */
export interface IWebSocketRecordAuthOptions<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> {
  authenticate: {
    schema?: undefined;
    fn: TWebSocketAuthenticateFn<Record<string, unknown>, MetadataType>;
  };
  /** Required when `requireEncryption` is true. */
  handshake?: { fn: TWebSocketHandshakeFn };
}

/** How a client authenticates. The server refuses authentication data that is not an object, with or without a schema. */
export type TWebSocketAuthOptions<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> =
  | IWebSocketSchemaAuthOptions<AuthDataType, MetadataType>
  | IWebSocketRecordAuthOptions<MetadataType>;

/** Produces the server public key and salt for an encrypted session during authentication. Resolves `null` or `false` to refuse the handshake. */
export type TWebSocketHandshakeFn<
  AuthDataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  clientId: string;
  userId?: string;
  data: AuthDataType;
}) => ValueOrPromise<{ serverPublicKey: string; salt: string } | null | false>;

/** Returns the subset of the requested `rooms` the client may join; when none is allowed, the join is rejected. */
export type TWebSocketValidateRoomFn = (opts: {
  clientId: string;
  userId?: string;
  rooms: string[];
}) => ValueOrPromise<string[]>;

/** Called after a client has authenticated. */
export type TWebSocketClientConnectedFn<
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: { clientId: string; userId?: string; metadata?: MetadataType }) => ValueOrPromise<void>;

/** Called after a client has disconnected. */
export type TWebSocketClientDisconnectedFn = (opts: {
  clientId: string;
  userId?: string;
}) => ValueOrPromise<void>;

/** Handles a message received from an authenticated client. */
export type TWebSocketMessageHandler = (opts: {
  clientId: string;
  userId?: string;
  message: IWebSocketMessage;
}) => ValueOrPromise<void>;

/** Rewrites an outbound event before it is sent to an encrypted client. Resolving `null` or `undefined` sends the original event and data. */
export type TWebSocketOutboundTransformer<
  DataType = unknown,
  MetadataType extends Record<string, unknown> = Record<string, unknown>,
> = (opts: {
  client: IWebSocketClient<MetadataType>;
  event: string;
  data: DataType;
}) => ValueOrPromise<TNullable<{ event: string; data: DataType }>>;
