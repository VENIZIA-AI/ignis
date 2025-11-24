import { int } from '@/utilities/parse.utility';
import Redis from 'ioredis';
import { DefaultRedisHelper } from './default.helper';
import { IRedisHelperOptions } from './types';

export class RedisHelper extends DefaultRedisHelper {
  constructor(opts: IRedisHelperOptions) {
    const {
      name,
      host,
      port,
      password,

      // Optional
      database = 0,
      autoConnect = true,
      maxRetry = 0,
    } = opts;

    super({
      ...opts,
      scope: RedisHelper.name,
      identifier: name,
      client: new Redis({
        name,
        host,
        port: int(port),
        password,
        db: database,
        lazyConnect: !autoConnect,
        showFriendlyErrorStack: true,
        retryStrategy: (attemptCounter: number) => {
          if (maxRetry > -1 && attemptCounter > maxRetry) {
            return undefined;
          }

          const strategy = Math.max(Math.min(attemptCounter * 2000, 5000), 1000);
          return strategy;
        },
        maxRetriesPerRequest: null,
      }),
    });
  }

  override getClient() {
    return this.client as Redis;
  }
}
