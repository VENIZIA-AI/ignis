import { ModuleUtility } from '@/utilities/module.utility';
import { int } from '@/utilities/parse.utility';
import type { Redis } from 'ioredis';
import { AbstractRedisHelper } from './../base';
import { IRedisSingleHelperOptions } from './../common';

export class RedisSingleHelper extends AbstractRedisHelper<Redis> {
  constructor(opts: IRedisSingleHelperOptions) {
    const { name, host, port, password, database = 0, autoConnect = true, maxRetry = 0 } = opts;

    // Optional peer, loaded when a client is built: an app with no Redis installs no ioredis.
    const ioredis = ModuleUtility.loadSync<typeof import('ioredis')>({ module: 'ioredis' });

    super({
      ...opts,
      scope: RedisSingleHelper.name,
      identifier: name,
      client: new ioredis.Redis({
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
