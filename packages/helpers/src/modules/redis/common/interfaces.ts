import type { TRedisClient } from './types';

export interface IRedisConnection {
  getClient(): TRedisClient;
  duplicateClient(): TRedisClient;
  ping(): Promise<string>;
  connect(): Promise<boolean>;
  disconnect(): Promise<boolean>;
}

export interface IRedisKey {
  exists(opts: { keys: Array<string> }): Promise<number>;
  expire(opts: { key: string; seconds: number }): Promise<boolean>;
  expireAt(opts: { key: string; atEpochSeconds: number }): Promise<boolean>;
  ttl(opts: { key: string }): Promise<number>;
  persist(opts: { key: string }): Promise<boolean>;
  incr(opts: { key: string }): Promise<number>;
  decr(opts: { key: string }): Promise<number>;
  incrBy(opts: { key: string; value: number }): Promise<number>;
  decrBy(opts: { key: string; value: number }): Promise<number>;
}

export interface IRedisKeyValue {
  set<T>(opts: {
    key: string;
    value: T;
    options?: { log?: boolean; expiresIn?: number };
  }): Promise<void>;
  get<T = string>(opts: { key: string; transform?: (input: string) => T }): Promise<T | null>;

  del(opts: { keys: Array<string> }): Promise<number>;

  keys(opts: { key: string }): Promise<Array<string>>;

  getString(opts: { key: string }): Promise<string | null>;
  getStrings(opts: { keys: Array<string> }): Promise<(string | null)[]>;

  getObject<T>(opts: { key: string }): Promise<T | null>;
  getObjects(opts: { keys: Array<string> }): Promise<(unknown | null)[]>;

  mSet<T>(opts: {
    payload: Array<{ key: string; value: T }>;
    options?: { log?: boolean };
  }): Promise<void>;

  mGet<T = string>(opts: {
    keys: Array<string>;
    transform?: (input: string) => T;
  }): Promise<(T | null)[]>;
}

export interface IRedisHash {
  hSet<T extends Record<string, unknown>>(opts: {
    key: string;
    value: T;
    options?: { log?: boolean };
  }): Promise<number>;
  hGetAll(opts: { key: string; transform?: <T, R>(input: T) => R }): Promise<unknown>;
  hGet(opts: { key: string; field: string }): Promise<string | null>;
  hDel(opts: { key: string; fields: Array<string> }): Promise<number>;
  hExists(opts: { key: string; field: string }): Promise<boolean>;
  hKeys(opts: { key: string }): Promise<string[]>;
  hVals(opts: { key: string }): Promise<string[]>;
  hIncrBy(opts: { key: string; field: string; value: number }): Promise<number>;
  hLen(opts: { key: string }): Promise<number>;
}

export interface IRedisSet {
  sAdd(opts: { key: string; members: Array<string | number> }): Promise<number>;
  sRem(opts: { key: string; members: Array<string | number> }): Promise<number>;
  sMembers(opts: { key: string }): Promise<string[]>;
  sIsMember(opts: { key: string; member: string | number }): Promise<boolean>;
  sCard(opts: { key: string }): Promise<number>;
}

export interface IRedisList {
  lPush(opts: { key: string; values: Array<string | number> }): Promise<number>;
  rPush(opts: { key: string; values: Array<string | number> }): Promise<number>;
  lPop(opts: { key: string }): Promise<string | null>;
  rPop(opts: { key: string }): Promise<string | null>;
  lRange(opts: { key: string; start: number; stop: number }): Promise<string[]>;
  lLen(opts: { key: string }): Promise<number>;
}

export interface IRedisPubSub {
  publish<T>(opts: { topics: Array<string>; payload: T; useCompress?: boolean }): Promise<void>;
  subscribe(opts: { topic: string }): void;
  unsubscribe(opts: { topic: string }): void;
}

export interface IRedisJson {
  jSet<T>(opts: { key: string; path: string; value: T }): Promise<string | null>;
  jGet<T>(opts: { key: string; path?: string }): Promise<T | null>;
  jDelete(opts: { key: string; path?: string }): Promise<number>;
  jNumberIncreaseBy(opts: { key: string; path: string; value: number }): Promise<string | null>;
  jStringAppend(opts: { key: string; path: string; value: string }): Promise<number[] | null>;
  jPush<T>(opts: { key: string; path: string; value: T }): Promise<number[] | null>;
  jPop<T>(opts: { key: string; path: string }): Promise<T | null>;
}

export interface IRedisCommand {
  execute<R>(command: string, parameters?: Array<string | number | Buffer>): Promise<R>;
}

export interface IRedisHelper
  extends
    IRedisConnection,
    IRedisKey,
    IRedisKeyValue,
    IRedisHash,
    IRedisSet,
    IRedisList,
    IRedisPubSub,
    IRedisJson,
    IRedisCommand {
  readonly name: string;
}
