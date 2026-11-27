import type { TRedisClient } from './types';

/** Client access and connection lifecycle of a Redis helper. `connect` and `disconnect` resolve `false` when the client status makes the call a no-op. */
export interface IRedisConnection {
  getClient(): TRedisClient;
  duplicateClient(): TRedisClient;
  ping(): Promise<string>;
  connect(): Promise<boolean>;
  disconnect(): Promise<boolean>;
}

/** Key-level commands: existence, expiry, TTL and counters. */
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

/** String value commands, including JSON-serialised object reads and batch get and set. `set` `expiresIn` is in milliseconds. */
export interface IRedisKeyValue {
  set<T>(opts: {
    key: string;
    value: T;
    options?: { log?: boolean; expiresIn?: number };
  }): Promise<void>;
  get<T>(opts: { key: string; transform: (input: string) => T }): Promise<T | null>;
  get(opts: { key: string; transform?: undefined }): Promise<string | null>;

  del(opts: { keys: Array<string> }): Promise<number>;

  keys(opts: { key: string }): Promise<Array<string>>;

  getString(opts: { key: string }): Promise<string | null>;
  getStrings(opts: { keys: Array<string> }): Promise<(string | null)[]>;

  /** The parsed JSON value, or `null`. Check it before you use it. */
  getObject(opts: { key: string }): Promise<unknown>;
  getObjects(opts: { keys: Array<string> }): Promise<unknown[]>;

  mSet<T>(opts: {
    payload: Array<{ key: string; value: T }>;
    options?: { log?: boolean };
  }): Promise<void>;

  mGet<T>(opts: { keys: Array<string>; transform: (input: string) => T }): Promise<(T | null)[]>;
  mGet(opts: { keys: Array<string>; transform?: undefined }): Promise<(string | null)[]>;
}

/** Hash commands (`HSET`, `HGET`, ...) on one key. */
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

/** Set commands (`SADD`, `SMEMBERS`, ...) on one key. */
export interface IRedisSet {
  sAdd(opts: { key: string; members: Array<string | number> }): Promise<number>;
  sRem(opts: { key: string; members: Array<string | number> }): Promise<number>;
  sMembers(opts: { key: string }): Promise<string[]>;
  sIsMember(opts: { key: string; member: string | number }): Promise<boolean>;
  sCard(opts: { key: string }): Promise<number>;
}

/** List commands (`LPUSH`, `LRANGE`, ...) on one key. */
export interface IRedisList {
  lPush(opts: { key: string; values: Array<string | number> }): Promise<number>;
  rPush(opts: { key: string; values: Array<string | number> }): Promise<number>;
  lPop(opts: { key: string }): Promise<string | null>;
  rPop(opts: { key: string }): Promise<string | null>;
  lRange(opts: { key: string; start: number; stop: number }): Promise<string[]>;
  lLen(opts: { key: string }): Promise<number>;
}

/** Publish to many topics and subscribe on the helper client. `publish` serialises the payload as JSON and deflates it when `useCompress` is set. */
export interface IRedisPubSub {
  publish<T>(opts: { topics: Array<string>; payload: T; useCompress?: boolean }): Promise<void>;
  subscribe(opts: { topic: string }): void;
  unsubscribe(opts: { topic: string }): void;
}

/** RedisJSON commands (`JSON.SET`, `JSON.GET`, ...); the Redis server needs the JSON module. */
export interface IRedisJson {
  jSet<T>(opts: { key: string; path: string; value: T }): Promise<string | null>;
  /** The JSON text Redis answers, or `null`. */
  jGet(opts: {
    key: string;
    /** @default '$' */
    path?: string;
  }): Promise<string | null>;
  jDelete(opts: {
    key: string;
    /** @default '$' */
    path?: string;
  }): Promise<number>;
  jNumberIncreaseBy(opts: { key: string; path: string; value: number }): Promise<string | null>;
  /** A `$` path answers one length per match (`null` where the match has another type); a legacy path one length. */
  jStringAppend(opts: {
    key: string;
    path: string;
    value: string;
  }): Promise<Array<number | null> | number | null>;
  /** A `$` path answers one length per match (`null` where the match has another type); a legacy path one length. */
  jPush<T>(opts: {
    key: string;
    path: string;
    value: T;
  }): Promise<Array<number | null> | number | null>;
  jPop(opts: { key: string; path: string }): Promise<unknown>;
}

/** Escape hatch to run any Redis command by name. */
export interface IRedisCommand {
  execute(command: string, parameters?: Array<string | number | Buffer>): Promise<unknown>;
}

/** Full surface of a Redis helper, composed from the command-group interfaces; `name` is the identifier it was created with. */
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
