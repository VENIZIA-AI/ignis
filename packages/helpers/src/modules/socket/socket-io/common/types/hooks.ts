import { type TValueOrPromise } from '@/common/types';
import type { Socket as IOSocket } from 'socket.io';
import { type IHandshake } from './client';

/** Handler for a Socket.IO event, receiving the event payload. */
export type TSocketIOEventHandler<T = unknown> = (data: T) => TValueOrPromise<void>;
/** Decides whether a connecting client is authenticated from its handshake; resolves `true` to accept. */
export type TSocketIOAuthenticateFn = (args: IHandshake) => TValueOrPromise<boolean>;
/** Returns the subset of the requested `rooms` the socket may join. */
export type TSocketIOValidateRoomFn = (opts: {
  socket: IOSocket;
  rooms: string[];
}) => TValueOrPromise<string[]>;
/** Called after a client has authenticated and been set up. */
export type TSocketIOClientConnectedFn = (opts: { socket: IOSocket }) => TValueOrPromise<void>;
