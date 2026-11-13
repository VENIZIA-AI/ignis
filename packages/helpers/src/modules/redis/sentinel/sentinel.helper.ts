import { ModuleUtility } from '@/utilities/module.utility';
import { ParseUtility } from '@/utilities/parse.utility';
import type { Redis } from 'ioredis';
import { AbstractRedisHelper } from './../base';
import { RedisDefaults } from './../common';
import { RedisSentinelDefaults, RedisSentinelRoles } from './constants';
import type { IRedisSentinelHelperOptions } from './types';

/** Redis helper for a master and replicas behind Sentinel. `redisOptions` overrides the helper defaults; the first-class fields override `redisOptions`. */
export class RedisSentinelHelper extends AbstractRedisHelper<Redis> {
  constructor(opts: IRedisSentinelHelperOptions) {
    const {
      name,
      sentinel,
      username,
      password,
      database = 0,
      autoConnect = true,
      maxRetry = RedisDefaults.MAX_RETRY,
      redisOptions = {},
    } = opts;

    const normalizedSentinels = sentinel.nodes.map((node) => ({
      host: node.host,
      port: ParseUtility.toInt({ input: node.port ?? RedisSentinelDefaults.PORT }),
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
        name: sentinel.masterName,
        role: sentinel.role ?? RedisSentinelRoles.MASTER,
        db: database,
        lazyConnect: !autoConnect,
        username: username ?? redisOptions.username,
        password: password ?? redisOptions.password,
        sentinelUsername: sentinel.username ?? redisOptions.sentinelUsername,
        sentinelPassword: sentinel.password ?? redisOptions.sentinelPassword,
      }),
    });
  }
}
