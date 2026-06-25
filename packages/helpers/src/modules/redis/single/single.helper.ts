import { int } from '@/utilities/parse.utility';
import Redis from 'ioredis';
import { AbstractRedisHelper } from './../base';
import { IRedisSingleHelperOptions } from './../common';

export class RedisSingleHelper extends AbstractRedisHelper<Redis> {
  constructor(opts: IRedisSingleHelperOptions) {
    const { name, host, port, password, database = 0, autoConnect = true, maxRetry = 0 } = opts;

    super({
      ...opts,
      scope: RedisSingleHelper.name,
      identifier: name,
      client: new Redis({
        name,
        host,
        port: int(port),
        password,
        db: database,
        lazyConnect: !autoConnect,
        ...AbstractRedisHelper.buildDefaultOpts({ maxRetry }),
      }),
    });
  }

  override getClient() {
    return this.client as Redis;
  }
}
