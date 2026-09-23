import { int } from '@/utilities';
import { ModuleUtility } from '@/utilities/module.utility';
import type { Cluster, ClusterOptions } from 'ioredis';
import { AbstractRedisHelper } from './../base';
import { IRedisClusterHelperOptions } from './../common';

export class RedisClusterHelper extends AbstractRedisHelper<Cluster> {
  private startupNodes: Array<{ host: string; port: number; password?: string }>;
  private clusterOpts: ClusterOptions;
  private ioredis: typeof import('ioredis');

  constructor(opts: IRedisClusterHelperOptions) {
    const { autoConnect = true } = opts;

    const startupNodes = opts.nodes.map(node => ({
      host: node.host,
      port: int(node.port),
      password: node.password,
    }));

    // Precedence (low -> high): the two framework defaults, then `clusterOptions` verbatim. The raw
    // hatch stays the last word, because a caller already threading `lazyConnect` through it must
    // keep the timing it has today. `enableOfflineQueue` is stated rather than inherited from
    // ioredis, so the queue a cluster needs between bind and connect cannot go missing on an
    // ioredis default change. Deliberately NOT `buildDefaultOpts`: cluster's retry and
    // per-node-failure semantics differ from single's, and folding them in here is a regression.
    const clusterOpts: ClusterOptions = {
      enableOfflineQueue: true,
      lazyConnect: !autoConnect,
      ...opts.clusterOptions,
    };

    const ioredis =
      opts.module ?? ModuleUtility.loadSync<typeof import('ioredis')>({ module: 'ioredis' });

    super({
      ...opts,
      scope: RedisClusterHelper.name,
      identifier: opts.name,
      client: new ioredis.Cluster(startupNodes, clusterOpts),
    });

    this.startupNodes = startupNodes;
    this.clusterOpts = clusterOpts;
    this.ioredis = ioredis;
  }

  override getClient() {
    return this.client as Cluster;
  }

  override duplicateClient(): Cluster {
    return new this.ioredis.Cluster(this.startupNodes, this.clusterOpts);
  }
}
