import { BaseHelper } from '@/helpers/base';
import { getError } from '@/helpers/error';
import { Cluster, Redis } from 'ioredis';
import isEmpty from 'lodash/isEmpty';
import zlib from 'node:zlib';
import { IRedisHelperCallbacks } from './types';

// -----------------------------------------------------------------------------------------------
export class DefaultRedisHelper extends BaseHelper {
  client: Redis | Cluster;
  name: string;

  constructor(
    opts: { scope: string; identifier: string; client: Redis | Cluster } & IRedisHelperCallbacks,
  ) {
    super({ scope: opts.scope, identifier: opts.identifier });

    this.name = opts.identifier;
    this.client = opts.client;

    const { onInitialized, onConnected, onReady, onError } = opts;

    this.client.on('connect', () => {
      this.logger.info('[%s][connect] Redis CONNECTED', this.name);
      onConnected?.({ name: this.name, helper: this });
    });

    this.client.on('ready', () => {
      this.logger.info('[%s][ready] Redis READY', this.name);
      onReady?.({ name: this.name, helper: this });
    });

    this.client.on('error', (error: Error) => {
      this.logger.error('[%s][error] Redis ERROR | Error: %s', this.name, error);
      onError?.({ name: this.name, helper: this, error });
    });

    this.client.on('reconnecting', () => {
      this.logger.warn('[%s][reconnecting] Redis client RECONNECTING', this.name);
    });

    onInitialized?.({ name: this.name, helper: this });
  }

  getClient() {
    return this.client;
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

      if (!this.client || invalidStatuses.includes(this.client.status)) {
        this.logger.info(
          '[connect] status: %s | Invalid redis status to invoke connect',
          this.client.status,
        );

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

  // ---------------------------------------------------------------------------------
  disconnect() {
    return new Promise<boolean>((resolve, reject) => {
      const invalidStatuses: (typeof this.client.status)[] = ['end', 'close'];
      if (!this.client || invalidStatuses.includes(this.client.status)) {
        this.logger.info(
          '[disconnect] status: %s | Invalid redis status to invoke disconnect',
          this.client.status,
        );
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

  // ---------------------------------------------------------------------------------
  async set<T>(opts: { key: string; value: T; options?: { log: boolean } }): Promise<void> {
    const { key, value, options = { log: false } } = opts;

    if (!this.client) {
      this.logger.info('[set] No valid Redis connection!');
      return;
    }

    const serialized = JSON.stringify(value);
    await this.client.set(key, serialized);

    if (!options?.log) {
      return;
    }

    this.logger.info(`[set] Set key: ${key} | value: ${serialized}`);
  }

  // ---------------------------------------------------------------------------------
  async get<T = string>(opts: {
    key: string;
    transform?: (input: string) => T;
  }): Promise<T | null> {
    const { key, transform } = opts;
    if (!this.client) {
      this.logger.info('[get] No valid Redis connection!');
      return null;
    }

    const value = await this.client.get(key);
    if (!value) {
      return null;
    }

    return transform ? transform(value) : (value as unknown as T);
  }

  // ---------------------------------------------------------------------------------
  del(opts: { keys: Array<string> }) {
    const { keys } = opts;
    return this.client.del(keys);
  }

  // ---------------------------------------------------------------------------------
  getString(opts: { key: string }) {
    return this.get(opts);
  }

  // ---------------------------------------------------------------------------------
  getStrings(opts: { keys: Array<string> }) {
    return this.mget(opts);
  }

  // ---------------------------------------------------------------------------------
  getObject(opts: { key: string }) {
    return this.get({
      ...opts,
      transform: (el: string) => JSON.parse(el),
    });
  }

  // ---------------------------------------------------------------------------------
  getObjects(opts: { keys: Array<string> }) {
    return this.mget({
      ...opts,
      transform: (el: string) => JSON.parse(el),
    });
  }

  // ---------------------------------------------------------------------------------
  async hset<T extends Record<string, unknown>>(opts: {
    key: string;
    value: T;
    options?: { log: boolean };
  }): Promise<number> {
    if (!this.client) {
      this.logger.info('[hset] No valid Redis connection!');
      return 0;
    }

    const { key, value, options } = opts;
    const rs = await this.client.hset(key, value as Record<string, string | number | Buffer>);

    if (!options?.log) {
      return rs;
    }

    this.logger.info('[hset] Result: %j', rs);
    return rs;
  }

  // ---------------------------------------------------------------------------------
  hSet<T extends Record<string, unknown>>(opts: {
    key: string;
    value: T;
    options?: { log: boolean };
  }): Promise<number> {
    return this.hset(opts);
  }

  // ---------------------------------------------------------------------------------
  async hgetall(opts: { key: string; transform?: <T, R>(input: T) => R }) {
    const { key, transform } = opts;
    if (!this.client) {
      this.logger.info('[get] No valid Redis connection!');
      return null;
    }

    const value = await this.client.hgetall(key);
    if (!transform || !value) {
      return value;
    }

    return transform(value);
  }

  // ---------------------------------------------------------------------------------
  hGetAll(opts: { key: string; transform?: <T, R>(input: T) => R }) {
    return this.hgetall(opts);
  }

  // ---------------------------------------------------------------------------------
  async mset<T>(opts: {
    payload: Array<{ key: string; value: T }>;
    options?: { log: boolean };
  }): Promise<void> {
    if (!this.client) {
      this.logger.info('[set] No valid Redis connection!');
      return;
    }

    const { payload, options } = opts;
    const serialized = payload?.reduce(
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

    this.logger.info('[mset] Payload: %j', serialized);
  }

  // ---------------------------------------------------------------------------------
  mSet<T>(opts: {
    payload: Array<{ key: string; value: T }>;
    options?: { log: boolean };
  }): Promise<void> {
    return this.mset(opts);
  }

  // ---------------------------------------------------------------------------------
  async mget<T = string>(opts: {
    keys: Array<string>;
    transform?: (input: string) => T;
  }): Promise<(T | null)[]> {
    const { keys, transform } = opts;
    if (!this.client) {
      this.logger.info('[get] No valid Redis connection!');
      return [];
    }

    const values = await this.client.mget(keys);
    if (!values?.length) {
      return [];
    }

    return values.map(el => (el ? (transform ? transform(el) : (el as unknown as T)) : null));
  }

  // ---------------------------------------------------------------------------------
  mGet<T = string>(opts: {
    keys: Array<string>;
    transform?: (input: string) => T;
  }): Promise<(T | null)[]> {
    return this.mget(opts);
  }

  // ---------------------------------------------------------------------------------
  async keys(opts: { key: string }) {
    const { key } = opts;
    if (!this.client) {
      this.logger.info('[keys] No valid Redis connection!');
      return [];
    }

    const existedKeys = await this.client.keys(key);
    return existedKeys;
  }

  // ---------------------------------------------------------------------------------
  jSet<T>(opts: { key: string; path: string; value: T }): Promise<string | null> {
    const { key, path, value } = opts;
    return this.execute<string | null>('JSON.SET', [key, path, JSON.stringify(value)]);
  }

  // ---------------------------------------------------------------------------------
  jGet<T>(opts: { key: string; path?: string }): Promise<T | null> {
    const { key, path = '$' } = opts;
    return this.execute<T | null>('JSON.GET', [key, path]);
  }

  // ---------------------------------------------------------------------------------
  jDelete(opts: { key: string; path?: string }): Promise<number> {
    const { key, path = '$' } = opts;
    return this.execute<number>('JSON.DEL', [key, path]);
  }

  // ---------------------------------------------------------------------------------
  jNumberIncreaseBy(opts: { key: string; path: string; value: number }): Promise<string | null> {
    const { key, path, value } = opts;
    return this.execute<string | null>('JSON.NUMINCRBY', [key, path, value]);
  }

  // ---------------------------------------------------------------------------------
  jStringAppend(opts: { key: string; path: string; value: string }): Promise<number[] | null> {
    const { key, path, value } = opts;
    return this.execute<number[] | null>('JSON.STRAPPEND', [key, path, value]);
  }

  // ---------------------------------------------------------------------------------
  jPush<T>(opts: { key: string; path: string; value: T }): Promise<number[] | null> {
    const { key, path, value } = opts;
    return this.execute<number[] | null>('JSON.ARRAPPEND', [key, path, JSON.stringify(value)]);
  }

  // ---------------------------------------------------------------------------------
  jPop<T>(opts: { key: string; path: string }): Promise<T | null> {
    const { key, path } = opts;
    return this.execute<T | null>('JSON.ARRPOP', [key, path]);
  }

  // ---------------------------------------------------------------------------------
  execute<R>(command: string, parameters?: Array<string | number | Buffer>): Promise<R> {
    if (!this.client) {
      throw getError({
        message: `[execute] Invalid client to execute | command: ${command}`,
      });
    }

    if (!parameters?.length) {
      return this.client.call(command) as Promise<R>;
    }

    return this.client.call(command, parameters) as Promise<R>;
  }

  // ---------------------------------------------------------------------------------
  async publish<T>(opts: {
    topics: Array<string>;
    payload: T;
    useCompress?: boolean;
  }): Promise<void> {
    const { topics, payload, useCompress = false } = opts;

    const validTopics = topics?.filter(topic => !isEmpty(topic));
    if (!validTopics?.length) {
      this.logger.error('[publish] No topic(s) to publish!');
      return;
    }

    if (!payload) {
      this.logger.error('[publish] Invalid payload to publish!');
      return;
    }

    if (!this.client) {
      this.logger.error('[publish] No valid Redis connection!');
      return;
    }

    await Promise.all(
      validTopics.map(topic => {
        let packet: Buffer;

        if (useCompress) {
          packet = zlib.deflateSync(Buffer.from(JSON.stringify(payload)));
        } else {
          packet = Buffer.from(JSON.stringify(payload));
        }

        return this.client.publish(topic, packet);
      }),
    );
  }

  // ---------------------------------------------------------------------------------
  subscribe(opts: { topic: string }) {
    const { topic } = opts;

    if (!topic || isEmpty(topic)) {
      this.logger.error('[subscribe] No topic to subscribe!');
      return;
    }

    if (!this.client) {
      this.logger.error('[subscribe] No valid Redis connection!');
      return;
    }

    this.client.subscribe(topic, (error, count) => {
      if (error) {
        throw getError({
          statusCode: 500,
          message: `[subscribe] Failed to subscribe to topic: ${topic}`,
        });
      }

      this.logger.info(
        '[subscribe] Subscribed to %s channel(s). Listening to channel: %s',
        count,
        topic,
      );
    });
  }
}
