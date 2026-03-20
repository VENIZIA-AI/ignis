import { int } from '@/utilities';
import { Cluster, type ClusterOptions } from 'ioredis';
import { DefaultRedisHelper } from './default.helper';
import { IRedisClusterHelperOptions } from './types';

export class RedisClusterHelper extends DefaultRedisHelper {
  private startupNodes: Array<{ host: string; port: number; password?: string }>;
  private clusterOpts?: ClusterOptions;

  constructor(opts: IRedisClusterHelperOptions) {
    const startupNodes = opts.nodes.map(node => ({
      host: node.host,
      port: int(node.port),
      password: node.password,
    }));

    super({
      ...opts,
      scope: RedisClusterHelper.name,
      identifier: opts.name,
      client: new Cluster(startupNodes, opts.clusterOptions),
    });

    this.startupNodes = startupNodes;
    this.clusterOpts = opts.clusterOptions;
  }

  override getClient() {
    return this.client as Cluster;
  }

  override duplicateClient(): Cluster {
    return new Cluster(this.startupNodes, this.clusterOpts);
  }
}
