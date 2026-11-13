import { ModuleUtility } from '@/utilities/module.utility';
import { ParseUtility } from '@/utilities/parse.utility';
import type { Redis } from 'ioredis';
import { AbstractRedisHelper } from './../base';
import { RedisDefaults } from './../common';
import type { IRedisSingleHelperOptions } from './types';

/** Redis helper over one ioredis `Redis` client connected to a single node. */
export class RedisSingleHelper extends AbstractRedisHelper<Redis> {
  constructor(opts: IRedisSingleHelperOptions) {
    const {
      name,
      host,
      port,
      username,
      password,
      database = 0,
      autoConnect = true,
      maxRetry = RedisDefaults.MAX_RETRY,
    } = opts;

    // Optional peer, loaded when a client is built: an app with no Redis installs no ioredis.
    const ioredis =
      opts.module ?? ModuleUtility.loadSync<typeof import('ioredis')>({ module: 'ioredis' });

    super({
      ...opts,
      scope: RedisSingleHelper.name,
      identifier: name,
      client: new ioredis.Redis({
        name,
        host,
        port: ParseUtility.toInt({ input: port ?? RedisDefaults.PORT }),
        username,
        password,
        db: database,
        lazyConnect: !autoConnect,
        ...AbstractRedisHelper.buildDefaultOpts({ scope: RedisSingleHelper.name, name, maxRetry }),
      }),
    });
  }
}
