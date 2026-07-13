import type { AnyType } from '@/common/types';
import { voidExecution } from '@/utilities/promise.utility';
import { BaseHelper } from '@/modules/base';
import isEmpty from 'lodash/isEmpty';
import { EventEmitter } from 'node:events';
import zlib from 'node:zlib';
import { IRedisHelper } from './../common/interfaces';
import { IRedisHelperCallbacks, TRedisClient } from './../common/types';

export class AbstractRedisHelper<ClientType extends TRedisClient = TRedisClient>
  extends BaseHelper
  implements IRedisHelper
{
  client: ClientType;
  readonly name: string;

  constructor(
    opts: { scope: string; identifier: string; client: ClientType } & IRedisHelperCallbacks,
  ) {
    super({ scope: opts.scope, identifier: opts.identifier });

    this.name = opts.identifier;
    this.client = opts.client;

    const { onInitialized, onConnected, onReady, onError } = opts;
    const emitter = this.client as EventEmitter;

    emitter.on('connect', () => {
      this.logger.for('connect').info('Redis CONNECTED | Name: %s', this.name);
      onConnected?.({ name: this.name, helper: this });
    });

    emitter.on('ready', () => {
      this.logger.for('ready').info('Redis READY | Name: %s', this.name);
      onReady?.({ name: this.name, helper: this });
    });

    emitter.on('error', (error: Error) => {
      this.logger.for('error').error('Redis ERROR | Name: %s | Error: %s', this.name, error);
      onError?.({ name: this.name, helper: this, error });
    });

    emitter.on('reconnecting', () => {
      this.logger.for('reconnecting').warn('Redis client RECONNECTING | Name: %s', this.name);
    });

    onInitialized?.({ name: this.name, helper: this });
  }

  protected static buildRetryStrategy(opts: { maxRetry: number }) {
    const { maxRetry } = opts;

    return (attemptCounter: number) => {
      if (maxRetry > -1 && attemptCounter > maxRetry) {
        return undefined;
      }

      return Math.max(Math.min(attemptCounter * 2000, 5000), 1000);
    };
  }

  protected static buildDefaultOpts(opts: { maxRetry: number }) {
    return {
      showFriendlyErrorStack: true,
      maxRetriesPerRequest: null,
      retryStrategy: AbstractRedisHelper.buildRetryStrategy({ maxRetry: opts.maxRetry }),
    };
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle (IRedisConnection)
  // ---------------------------------------------------------------------------

  getClient() {
    return this.client;
  }

  duplicateClient() {
    return this.client.duplicate();
  }

  ping() {
    return this.client.ping();
  }

  connect() {
    return new Promise<boolean>((resolve, reject) => {
      const invalidStatuses: (typeof this.client.status)[] = [
        'ready',
        'reconnecting',
        'connecting',
      ];

      if (invalidStatuses.includes(this.client.status)) {
        this.logger
          .for(this.connect.name)
          .info('status: %s | Invalid redis status to invoke connect', this.client.status);

        resolve(false);
        return;
      }

      this.client
        .connect()
        .then(() => {
          resolve(this.client.status === 'ready');
        })
        .catch(reject);
    });
  }

  disconnect() {
    return new Promise<boolean>((resolve, reject) => {
      const invalidStatuses: (typeof this.client.status)[] = ['end', 'close'];
      if (invalidStatuses.includes(this.client.status)) {
        this.logger
          .for(this.disconnect.name)
          .info('status: %s | Invalid redis status to invoke disconnect', this.client.status);
        resolve(false);
        return;
      }

      this.client
        .quit()
        .then(rs => {
          resolve(rs === 'OK');
        })
        .catch(reject);
    });
  }

  // ---------------------------------------------------------------------------
  // Key lifecycle + counters (IRedisKey)
  // ---------------------------------------------------------------------------

  exists(opts: { keys: Array<string> }): Promise<number> {
    const { keys } = opts;
    if (!keys.length) {
      return Promise.resolve(0);
    }
    return this.client.exists(...keys);
  }

  async expire(opts: { key: string; seconds: number }): Promise<boolean> {
    const { key, seconds } = opts;
    const result = await this.client.expire(key, seconds);
    return result === 1;
  }

  async expireAt(opts: { key: string; atEpochSeconds: number }): Promise<boolean> {
    const { key, atEpochSeconds } = opts;
    const result = await this.client.expireat(key, atEpochSeconds);
    return result === 1;
  }

  ttl(opts: { key: string }): Promise<number> {
    const { key } = opts;
    return this.client.ttl(key);
  }

  async persist(opts: { key: string }): Promise<boolean> {
    const { key } = opts;
    const result = await this.client.persist(key);
    return result === 1;
  }

  incr(opts: { key: string }): Promise<number> {
    const { key } = opts;
    return this.client.incr(key);
  }

  decr(opts: { key: string }): Promise<number> {
    const { key } = opts;
    return this.client.decr(key);
  }

  incrBy(opts: { key: string; value: number }): Promise<number> {
    const { key, value } = opts;
    return this.client.incrby(key, value);
  }

  decrBy(opts: { key: string; value: number }): Promise<number> {
    const { key, value } = opts;
    return this.client.decrby(key, value);
  }

  // ---------------------------------------------------------------------------
  // Key-value (IRedisKeyValue)
  // ---------------------------------------------------------------------------

  async set<T>(opts: {
    key: string;
    value: T;
    options?: { log?: boolean; expiresIn?: number };
  }): Promise<void> {
    const { key, value, options } = opts;

    const serialized = JSON.stringify(value);
    if (typeof options?.expiresIn === 'number' && options.expiresIn > 0) {
      await this.client.set(key, serialized, 'PX', options.expiresIn);
    } else {
      await this.client.set(key, serialized);
    }

    if (!options?.log) {
      return;
    }

    this.logger.for(this.set.name).info('Set key: %s | value: %s', key, serialized);
  }

  async get<T = string>(opts: {
    key: string;
    transform?: (input: string) => T;
  }): Promise<T | null> {
    const { key, transform } = opts;

    const value = await this.client.get(key);
    if (!value) {
      return null;
    }

    return transform ? transform(value) : (value as AnyType);
  }

  del(opts: { keys: Array<string> }): Promise<number> {
    const { keys } = opts;
    if (!keys.length) {
      return Promise.resolve(0);
    }
    return this.client.del(keys);
  }

  getString(opts: { key: string }) {
    return this.get(opts);
  }

  getStrings(opts: { keys: Array<string> }) {
    return this.mGet(opts);
  }

  getObject<T>(opts: { key: string }) {
    return this.get<T>({
      ...opts,
      transform: (el: string) => JSON.parse(el),
    });
  }

  getObjects(opts: { keys: Array<string> }) {
    return this.mGet({
      ...opts,
      transform: (el: string) => JSON.parse(el),
    });
  }

  async mSet<T>(opts: {
    payload: Array<{ key: string; value: T }>;
    options?: { log?: boolean };
  }): Promise<void> {
    const { payload, options } = opts;
    if (!payload.length) {
      return;
    }

    const serialized = payload.reduce(
      (current, el) => {
        const { key, value } = el;
        return { ...current, [key]: JSON.stringify(value) };
      },
      {} as Record<string, string>,
    );
    await this.client.mset(serialized);

    if (!options?.log) {
      return;
    }

    this.logger.for(this.mSet.name).info('Payload: %j', serialized);
  }

  async mGet<T = string>(opts: {
    keys: Array<string>;
    transform?: (input: string) => T;
  }): Promise<(T | null)[]> {
    const { keys, transform } = opts;
    if (!keys.length) {
      return [];
    }

    const values = await this.client.mget(keys);
    if (!values?.length) {
      return [];
    }

    return values.map(el => (el ? (transform ? transform(el) : (el as AnyType)) : null));
  }

  keys(opts: { key: string }): Promise<string[]> {
    const { key } = opts;
    return this.client.keys(key);
  }

  // ---------------------------------------------------------------------------
  // Hash operations (IRedisHash)
  // ---------------------------------------------------------------------------

  async hSet<T extends Record<string, unknown>>(opts: {
    key: string;
    value: T;
    options?: { log?: boolean };
  }): Promise<number> {
    const { key, value, options } = opts;
    const result = await this.client.hset(key, value as Record<string, string | number | Buffer>);

    if (!options?.log) {
      return result;
    }

    this.logger.for(this.hSet.name).info('Result: %j', result);
    return result;
  }

  async hGetAll(opts: { key: string; transform?: <T, R>(input: T) => R }) {
    const { key, transform } = opts;
    const value = await this.client.hgetall(key);
    if (!transform || !value) {
      return value;
    }

    return transform(value);
  }

  hGet(opts: { key: string; field: string }): Promise<string | null> {
    const { key, field } = opts;
    return this.client.hget(key, field);
  }

  hDel(opts: { key: string; fields: Array<string> }): Promise<number> {
    const { key, fields } = opts;
    if (!fields.length) {
      return Promise.resolve(0);
    }
    return this.client.hdel(key, ...fields);
  }

  async hExists(opts: { key: string; field: string }): Promise<boolean> {
    const { key, field } = opts;
    const result = await this.client.hexists(key, field);
    return result === 1;
  }

  hKeys(opts: { key: string }): Promise<string[]> {
    const { key } = opts;
    return this.client.hkeys(key);
  }

  hVals(opts: { key: string }): Promise<string[]> {
    const { key } = opts;
    return this.client.hvals(key);
  }

  hIncrBy(opts: { key: string; field: string; value: number }): Promise<number> {
    const { key, field, value } = opts;
    return this.client.hincrby(key, field, value);
  }

  hLen(opts: { key: string }): Promise<number> {
    const { key } = opts;
    return this.client.hlen(key);
  }

  // ---------------------------------------------------------------------------
  // Set operations (IRedisSet)
  // ---------------------------------------------------------------------------

  sAdd(opts: { key: string; members: Array<string | number> }): Promise<number> {
    const { key, members } = opts;
    if (!members.length) {
      return Promise.resolve(0);
    }
    return this.client.sadd(key, ...members);
  }

  sRem(opts: { key: string; members: Array<string | number> }): Promise<number> {
    const { key, members } = opts;
    if (!members.length) {
      return Promise.resolve(0);
    }
    return this.client.srem(key, ...members);
  }

  sMembers(opts: { key: string }): Promise<string[]> {
    const { key } = opts;
    return this.client.smembers(key);
  }

  async sIsMember(opts: { key: string; member: string | number }): Promise<boolean> {
    const { key, member } = opts;
    const result = await this.client.sismember(key, member);
    return result === 1;
  }

  sCard(opts: { key: string }): Promise<number> {
    const { key } = opts;
    return this.client.scard(key);
  }

  // ---------------------------------------------------------------------------
  // List operations (IRedisList)
  // ---------------------------------------------------------------------------

  lPush(opts: { key: string; values: Array<string | number> }): Promise<number> {
    const { key, values } = opts;
    if (!values.length) {
      return Promise.resolve(0);
    }
    return this.client.lpush(key, ...values);
  }

  rPush(opts: { key: string; values: Array<string | number> }): Promise<number> {
    const { key, values } = opts;
    if (!values.length) {
      return Promise.resolve(0);
    }
    return this.client.rpush(key, ...values);
  }

  lPop(opts: { key: string }): Promise<string | null> {
    const { key } = opts;
    return this.client.lpop(key);
  }

  rPop(opts: { key: string }): Promise<string | null> {
    const { key } = opts;
    return this.client.rpop(key);
  }

  lRange(opts: { key: string; start: number; stop: number }): Promise<string[]> {
    const { key, start, stop } = opts;
    return this.client.lrange(key, start, stop);
  }

  lLen(opts: { key: string }): Promise<number> {
    const { key } = opts;
    return this.client.llen(key);
  }

  // ---------------------------------------------------------------------------
  // RedisJSON (IRedisJson)
  // ---------------------------------------------------------------------------

  jSet<T>(opts: { key: string; path: string; value: T }): Promise<string | null> {
    const { key, path, value } = opts;
    return this.execute<string | null>('JSON.SET', [key, path, JSON.stringify(value)]);
  }

  jGet<T>(opts: { key: string; path?: string }): Promise<T | null> {
    const { key, path = '$' } = opts;
    return this.execute<T | null>('JSON.GET', [key, path]);
  }

  jDelete(opts: { key: string; path?: string }): Promise<number> {
    const { key, path = '$' } = opts;
    return this.execute<number>('JSON.DEL', [key, path]);
  }

  jNumberIncreaseBy(opts: { key: string; path: string; value: number }): Promise<string | null> {
    const { key, path, value } = opts;
    return this.execute<string | null>('JSON.NUMINCRBY', [key, path, value]);
  }

  jStringAppend(opts: { key: string; path: string; value: string }): Promise<number[] | null> {
    const { key, path, value } = opts;
    return this.execute<number[] | null>('JSON.STRAPPEND', [key, path, value]);
  }

  jPush<T>(opts: { key: string; path: string; value: T }): Promise<number[] | null> {
    const { key, path, value } = opts;
    return this.execute<number[] | null>('JSON.ARRAPPEND', [key, path, JSON.stringify(value)]);
  }

  jPop<T>(opts: { key: string; path: string }): Promise<T | null> {
    const { key, path } = opts;
    return this.execute<T | null>('JSON.ARRPOP', [key, path]);
  }

  // ---------------------------------------------------------------------------
  // Raw command (IRedisCommand)
  // ---------------------------------------------------------------------------

  execute<R>(command: string, parameters?: Array<string | number | Buffer>): Promise<R> {
    if (!parameters?.length) {
      return this.client.call(command) as Promise<R>;
    }

    return this.client.call(command, parameters) as Promise<R>;
  }

  // ---------------------------------------------------------------------------
  // Pub/Sub (IRedisPubSub)
  // ---------------------------------------------------------------------------

  async publish<T>(opts: {
    topics: Array<string>;
    payload: T;
    useCompress?: boolean;
  }): Promise<void> {
    const logger = this.logger.for(this.publish.name);
    const { topics, payload, useCompress = false } = opts;

    const validTopics = topics?.filter(topic => !isEmpty(topic));
    if (!validTopics?.length) {
      logger.error('No topic(s) to publish!');
      return;
    }

    if (!payload) {
      logger.error('Invalid payload to publish!');
      return;
    }

    const message = Buffer.from(JSON.stringify(payload));
    const packet = useCompress ? zlib.deflateSync(message) : message;

    await Promise.all(validTopics.map(topic => this.client.publish(topic, packet)));
  }

  subscribe(opts: { topic: string }) {
    const logger = this.logger.for(this.subscribe.name);
    const { topic } = opts;

    if (!topic || isEmpty(topic)) {
      logger.error('No topic to subscribe!');
      return;
    }

    voidExecution({
      logger: this.logger,
      scope: this.subscribe.name,
      execution: this.client.subscribe(topic, (error, count) => {
        if (error) {
          logger.error('Failed to subscribe to topic: %s | Error: %s', topic, error);
          return;
        }

        logger.info('Subscribed to %s channel(s). Listening to channel: %s', count, topic);
      }),
    });
  }

  unsubscribe(opts: { topic: string }) {
    const logger = this.logger.for(this.unsubscribe.name);
    const { topic } = opts;

    if (!topic || isEmpty(topic)) {
      logger.error('No topic to unsubscribe!');
      return;
    }

    voidExecution({
      logger: this.logger,
      scope: this.unsubscribe.name,
      execution: this.client.unsubscribe(topic, (error, count) => {
        if (error) {
          logger.error('Failed to unsubscribe from topic: %s | Error: %s', topic, error);
          return;
        }

        logger.info('Unsubscribed from %s channel(s).', count);
      }),
    });
  }
}
