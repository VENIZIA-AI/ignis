import { BaseHelper } from '@/base/helpers';
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
          '[disconnect] status: %s | Invalid redis status to invoke connect',
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
  async set(opts: { key: string; value: any; options?: { log: boolean } }) {
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
  async get(opts: { key: string; transform?: (input: string) => any }) {
    const { key, transform = (input: string) => input } = opts;
    if (!this.client) {
      this.logger.info('[get] No valid Redis connection!');
      return null;
    }

    const value = await this.client.get(key);
    if (!value) {
      return null;
    }

    return transform(value);
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
      transform: (cached: string) => JSON.parse(cached),
    });
  }

  // ---------------------------------------------------------------------------------
  getObjects(opts: { keys: Array<string> }) {
    return this.mget({
      ...opts,
      transform: (cached: string) => JSON.parse(cached),
    });
  }

  // ---------------------------------------------------------------------------------
  async hset(opts: { key: string; value: any; options?: { log: boolean } }) {
    if (!this.client) {
      this.logger.info('[hset] No valid Redis connection!');
      return;
    }

    const { key, value, options } = opts;
    const rs = await this.client.hset(key, value);

    if (!options?.log) {
      return rs;
    }

    this.logger.info('[hset] Result: %j', rs);
    return rs;
  }

  // ---------------------------------------------------------------------------------
  hSet(opts: { key: string; value: any; options?: { log: boolean } }) {
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
  async mset(opts: { payload: Array<{ key: string; value: any }>; options?: { log: boolean } }) {
    if (!this.client) {
      this.logger.info('[set] No valid Redis connection!');
      return;
    }

    const { payload, options } = opts;
    const serialized = payload?.reduce((current, el) => {
      const { key, value } = el;
      return { ...current, [key]: JSON.stringify(value) };
    }, {});
    await this.client.mset(serialized);

    if (!options?.log) {
      return;
    }

    this.logger.info('[mset] Payload: %j', serialized);
  }

  // ---------------------------------------------------------------------------------
  mSet(opts: { payload: Array<{ key: string; value: any }>; options?: { log: boolean } }) {
    return this.mset(opts);
  }

  // ---------------------------------------------------------------------------------
  async mget(opts: { keys: Array<string>; transform?: (input: string) => any }) {
    const { keys, transform = (input: string) => input } = opts;
    if (!this.client) {
      this.logger.info('[get] No valid Redis connection!');
      return null;
    }

    const values = await this.client.mget(keys);
    if (!values?.length) {
      return null;
    }

    return values?.map(el => (el ? transform(el) : el));
  }

  // ---------------------------------------------------------------------------------
  mGet(opts: { keys: Array<string>; transform?: (input: string) => any }) {
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
  jSet<T = any>(opts: { key: string; path: string; value: T }) {
    const { key, path, value } = opts;
    return this.execute('JSON.SET', [key, path, JSON.stringify(value)]);
  }

  // ---------------------------------------------------------------------------------
  jGet<T = any>(opts: { key: string; path?: string }) {
    const { key, path = '$' } = opts;
    return this.execute<T>('JSON.GET', [key, path]);
  }

  // ---------------------------------------------------------------------------------
  jDelete(opts: { key: string; path?: string }) {
    const { key, path = '$' } = opts;
    return this.execute<number>('JSON.DEL', [key, path]);
  }

  // ---------------------------------------------------------------------------------
  jNumberIncreaseBy(opts: { key: string; path: string; value: number }) {
    const { key, path, value } = opts;
    return this.execute('JSON.NUMINCRBY', [key, path, value]);
  }

  // ---------------------------------------------------------------------------------
  jStringAppend(opts: { key: string; path: string; value: string }) {
    const { key, path, value } = opts;
    return this.execute('JSON.STRAPPEND', [key, path, value]);
  }

  // ---------------------------------------------------------------------------------
  jPush<T = any>(opts: { key: string; path: string; value: T }) {
    const { key, path, value } = opts;
    return this.execute('JSON.ARRAPPEND', [key, path, JSON.stringify(value)]);
  }

  // ---------------------------------------------------------------------------------
  jPop<T = any>(opts: { key: string; path: string }) {
    const { key, path } = opts;
    return this.execute<T>('JSON.ARRPOP', [key, path]);
  }

  // ---------------------------------------------------------------------------------
  execute<R = any>(command: string, parameters?: Array<string | number | Buffer>): Promise<R> {
    if (!parameters?.length) {
      return this.client.call(command) as Promise<R>;
    }

    return this.client.call(command, parameters) as Promise<R>;
  }

  // ---------------------------------------------------------------------------------
  async publish<T = any>(opts: { topics: Array<string>; payload: T; useCompress?: boolean }) {
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
        let packet: any;

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
