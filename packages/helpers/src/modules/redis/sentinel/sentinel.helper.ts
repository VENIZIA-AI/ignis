import { ModuleUtility } from '@/utilities/module.utility';
import { ParseUtility } from '@/utilities/parse.utility';
import type { Redis } from 'ioredis';
import { AbstractRedisHelper } from './../base';
import { RedisDefaults, type IRedisSentinelHelperOptions, RedisSentinelRoles } from './../common';

/** Redis helper for a master and replicas behind Sentinel. `redisOptions` overrides the helper defaults; the first-class fields override `redisOptions`. */
export class RedisSentinelHelper extends AbstractRedisHelper<Redis> {
  constructor(opts: IRedisSentinelHelperOptions) {
    const {
      name,
      sentinels,
      masterName,
      role = RedisSentinelRoles.MASTER,
      password,
      sentinelPassword,
      sentinelUsername,
      database = 0,
      autoConnect = true,
      maxRetry = RedisDefaults.MAX_RETRY,
      redisOptions = {},
    } = opts;

    const normalizedSentinels = sentinels.map((sentinel) => ({
      host: sentinel.host,
      port: ParseUtility.toInt({ input: sentinel.port ?? 26379 }),
    }));

    const ioredis =
      opts.module ?? ModuleUtility.loadSync<typeof import('ioredis')>({ module: 'ioredis' });

    super({
      ...opts,
      scope: RedisSentinelHelper.name,
      identifier: name,
      // Precedence (low -> high): framework defaults, the redisOptions escape hatch, then first-class fields. An auth field left unset falls back to `redisOptions`, so an undefined first-class field never clobbers it.
      client: new ioredis.Redis({
        ...AbstractRedisHelper.buildDefaultOpts({
          scope: RedisSentinelHelper.name,
          name,
          maxRetry,
        }),
        ...redisOptions,
        sentinels: normalizedSentinels,
        name: masterName,
        role,
        db: database,
        lazyConnect: !autoConnect,
        password: password ?? redisOptions.password,
        sentinelPassword: sentinelPassword ?? redisOptions.sentinelPassword,
        sentinelUsername: sentinelUsername ?? redisOptions.sentinelUsername,
      }),
    });
  }
}
