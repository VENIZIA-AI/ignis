import { ParseUtility } from '@/utilities';
import { ModuleUtility } from '@/utilities/module.utility';
import type { Cluster, ClusterOptions } from 'ioredis';
import { AbstractRedisHelper } from './../base';
import { RedisDefaults, type IRedisClusterHelperOptions } from './../common';

/** Redis helper over an ioredis `Cluster`. `autoConnect: false` creates the client with `lazyConnect`; `clusterOptions` is applied last and overrides the defaults. */
export class RedisClusterHelper extends AbstractRedisHelper<Cluster> {
  private startupNodes: Array<{ host: string; port: number; password?: string }>;
  private clusterOpts: ClusterOptions;
  private ioredis: typeof import('ioredis');

  constructor(opts: IRedisClusterHelperOptions) {
    const { autoConnect = true, maxRetry = RedisDefaults.MAX_RETRY } = opts;

    const startupNodes = opts.nodes.map((node) => ({
      host: node.host,
      port: ParseUtility.toInt({ input: node.port }),
      password: node.password,
    }));

    // Precedence (low -> high): the framework defaults, then `clusterOptions` verbatim. The raw
    // hatch stays the last word, because a caller already threading `lazyConnect` through it must
    // keep the timing it has today. `enableOfflineQueue` is stated rather than inherited from
    // ioredis, so the queue a cluster needs between bind and connect cannot go missing on an
    // ioredis default change. `maxRetriesPerRequest: null` is what a BullMQ worker needs; the
    // cluster-level `clusterRetryStrategy` reconnects with the same backoff as the other modes.
    const clusterOpts: ClusterOptions = {
      enableOfflineQueue: true,
      lazyConnect: !autoConnect,
      clusterRetryStrategy: AbstractRedisHelper.buildRetryStrategy({
        scope: RedisClusterHelper.name,
        name: opts.name,
        maxRetry,
      }),
      ...opts.clusterOptions,
      // Merged, not replaced: node passwords and TLS live in `redisOptions`, and an app that sets them must keep what BullMQ needs. An explicit `maxRetriesPerRequest` still wins.
      redisOptions: { maxRetriesPerRequest: null, ...opts.clusterOptions?.redisOptions },
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
