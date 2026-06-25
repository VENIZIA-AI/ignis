import { int } from '@/utilities/parse.utility';
import { Redis } from 'ioredis';
import { AbstractRedisHelper } from './../base';
import { IRedisSentinelHelperOptions, RedisSentinelRoles } from './../common';

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
      maxRetry = 0,
      redisOptions = {},
    } = opts;

    const normalizedSentinels = sentinels.map(sentinel => ({
      host: sentinel.host,
      port: int(sentinel.port ?? 26379),
    }));

    super({
      ...opts,
      scope: RedisSentinelHelper.name,
      identifier: name,
      // Precedence (low -> high): framework defaults, the redisOptions escape hatch, then
      // first-class fields. Optional auth fields are spread ONLY when provided, so a value set
      // via redisOptions is not clobbered by an undefined first-class field.
      client: new Redis({
        ...AbstractRedisHelper.buildDefaultOpts({ maxRetry }),
        ...redisOptions,
        sentinels: normalizedSentinels,
        name: masterName,
        role,
        db: database,
        lazyConnect: !autoConnect,
        ...(password === undefined ? {} : { password }),
        ...(sentinelPassword === undefined ? {} : { sentinelPassword }),
        ...(sentinelUsername === undefined ? {} : { sentinelUsername }),
      }),
    });
  }

  override getClient() {
    return this.client as Redis;
  }
}
