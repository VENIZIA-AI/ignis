import { ValueOrPromise } from '@/common/types';
import type { Socket as IOSocket } from 'socket.io';
import { IHandshake } from './client';

export type TSocketIOEventHandler<T = unknown> = (data: T) => ValueOrPromise<void>;
export type TSocketIOAuthenticateFn = (args: IHandshake) => ValueOrPromise<boolean>;
export type TSocketIOValidateRoomFn = (opts: {
  socket: IOSocket;
  rooms: string[];
}) => ValueOrPromise<string[]>;
export type TSocketIOClientConnectedFn = (opts: { socket: IOSocket }) => ValueOrPromise<void>;
