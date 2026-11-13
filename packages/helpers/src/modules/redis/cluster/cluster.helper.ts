import { ParseUtility } from '@/utilities';
import { ModuleUtility } from '@/utilities/module.utility';
import type { Cluster, ClusterOptions } from 'ioredis';
import { AbstractRedisHelper } from './../base';
import { RedisDefaults, type IRedisClusterHelperOptions } from './../common';

/** Redis helper over an ioredis `Cluster`. `autoConnect: false` creates the client with `lazyConnect`; `clusterOptions` is applied last and overrides the defaults. */
export class RedisClusterHelper extends AbstractRedisHelper<Cluster> {
  private startupNodes: Array<{ host: string; port: number }>;
  private clusterOpts: ClusterOptions;
  private ioredis: typeof import('ioredis');

  constructor(opts: IRedisClusterHelperOptions) {
    const { autoConnect = true, maxRetry = RedisDefaults.MAX_RETRY } = opts;

    const startupNodes = opts.nodes.map((node) => ({
      host: node.host,
      port: ParseUtility.toInt({ input: node.port ?? RedisDefaults.PORT }),
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
      // Merged, not replaced: TLS and the like live in `redisOptions`, and an app that sets them must keep what BullMQ needs. An explicit `maxRetriesPerRequest` still wins.
      redisOptions: { maxRetriesPerRequest: null, ...opts.clusterOptions?.redisOptions },
    };

    // ioredis applies a per-node password to the startup nodes only; nodes found later are built from host:port and `redisOptions`. So the credentials go in `redisOptions`, where every node gets them. The first-class credentials fill what `clusterOptions.redisOptions` leaves unset (an explicit value there wins, an `undefined` does not clobber), the way the Sentinel helper falls back.
    clusterOpts.redisOptions ??= {};
    clusterOpts.redisOptions.username ??= opts.username;
    clusterOpts.redisOptions.password ??= opts.password;

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

  override duplicateClient(): Cluster {
    return new this.ioredis.Cluster(this.startupNodes, this.clusterOpts);
  }
}
