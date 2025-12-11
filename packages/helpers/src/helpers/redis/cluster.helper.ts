import { int } from '@/utilities';
import { Cluster } from 'ioredis';
import { DefaultRedisHelper } from './default.helper';
import { IRedisClusterHelperOptions } from './types';

export class RedisClusterHelper extends DefaultRedisHelper {
  constructor(opts: IRedisClusterHelperOptions) {
    super({
      ...opts,
      scope: RedisClusterHelper.name,
      identifier: opts.name,
      client: new Cluster(
        opts.nodes.map(node => {
          return {
            host: node.host,
            port: int(node.port),
            password: node.password,
          };
        }),
        opts.clusterOptions,
      ),
    });
  }

  override getClient() {
    return this.client as Cluster;
  }
}
