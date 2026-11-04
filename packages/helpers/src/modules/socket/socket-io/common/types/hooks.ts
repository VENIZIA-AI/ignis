import { type ValueOrPromise } from '@/common/types';
import type { Socket as IOSocket } from 'socket.io';
import { type IHandshake } from './client';

/** Handler for a Socket.IO event, receiving the event payload. */
export type TSocketIOEventHandler<T = unknown> = (data: T) => ValueOrPromise<void>;
/** Decides whether a connecting client is authenticated from its handshake; resolves `true` to accept. */
export type TSocketIOAuthenticateFn = (args: IHandshake) => ValueOrPromise<boolean>;
/** Returns the subset of the requested `rooms` the socket may join. */
export type TSocketIOValidateRoomFn = (opts: {
  socket: IOSocket;
  rooms: string[];
}) => ValueOrPromise<string[]>;
/** Called after a client has authenticated and been set up. */
export type TSocketIOClientConnectedFn = (opts: { socket: IOSocket }) => ValueOrPromise<void>;
