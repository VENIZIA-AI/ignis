---
title: Redis helpers take credentials in one shape, with the Sentinel and cluster-node ones in their own place
description: "Top-level username and password are always the data nodes' credentials. Sentinel moves its processes into a sentinel scope, and a cluster takes username and password once for every node."
packages: ['@venizia/ignis-helpers']
migration:
  - id: sentinels-to-sentinel-nodes
    symbols: [IRedisSentinelHelperProps, IRedisSentinelHelperOptions, RedisSentinelHelper]
    upgrade:
      before: |
        new RedisSentinelHelper({
          name: 'ha-cache',
          masterName: 'mymaster',
          sentinels: [{ host: '10.0.0.1', port: 26379 }, { host: '10.0.0.2' }],
        });
      after: |
        new RedisSentinelHelper({
          name: 'ha-cache',
          sentinel: {
            masterName: 'mymaster',
            nodes: [{ host: '10.0.0.1', port: 26379 }, { host: '10.0.0.2' }],
          },
        });
    downgrade:
      steps:
        - "Pass the list as sentinels at the top level again, with masterName beside it, and drop the sentinel scope."
    data: "A JavaScript caller that still passes sentinels at the top level gets a TypeError at construction, because sentinel.nodes is read."
  - id: master-name-to-sentinel-master-name
    symbols: [IRedisSentinelHelperProps, IRedisSentinelHelperOptions, RedisSentinelHelper]
    upgrade:
      before: |
        new RedisSentinelHelper({ name: 'ha-cache', masterName: 'mymaster', sentinels });
      after: |
        new RedisSentinelHelper({ name: 'ha-cache', sentinel: { masterName: 'mymaster', nodes: sentinels } });
    downgrade:
      steps:
        - "Move masterName back to the top level."
    data: "A JavaScript caller that still passes masterName at the top level has it ignored: ioredis then looks for a group with no name. Move it before you deploy."
  - id: role-to-sentinel-role
    symbols: [IRedisSentinelHelperProps, IRedisSentinelHelperOptions, RedisSentinelHelper]
    upgrade:
      before: |
        new RedisSentinelHelper({ name: 'ha-cache', masterName: 'mymaster', sentinels, role: RedisSentinelRoles.SLAVE });
      after: |
        new RedisSentinelHelper({
          name: 'ha-cache',
          sentinel: { masterName: 'mymaster', role: RedisSentinelRoles.SLAVE, nodes: sentinels },
        });
    downgrade:
      steps:
        - "Move role back to the top level."
    data: "A JavaScript caller that still passes role at the top level has it ignored: the helper then connects to the master, not a replica. Move it before you deploy."
  - id: sentinel-credentials-to-sentinel-scope
    symbols: [IRedisSentinelHelperProps, IRedisSentinelHelperOptions]
    upgrade:
      before: |
        new RedisSentinelHelper({
          name: 'ha-cache',
          masterName: 'mymaster',
          sentinels: [{ host: '10.0.0.1' }],
          sentinelUsername: 'sentinel-user',
          sentinelPassword: 'sentinel-secret',
          password: 'data-secret',
        });
      after: |
        new RedisSentinelHelper({
          name: 'ha-cache',
          sentinel: {
            masterName: 'mymaster',
            username: 'sentinel-user',
            password: 'sentinel-secret',
            nodes: [{ host: '10.0.0.1' }],
          },
          username: 'data-user', // new: the data nodes' ACL user
          password: 'data-secret',
        });
    downgrade:
      steps:
        - "Move sentinel.username and sentinel.password back to sentinelUsername and sentinelPassword at the top level, and drop username if you added it."
    data: "A JavaScript caller that still passes sentinelUsername or sentinelPassword at the top level has them ignored: the Sentinel processes then get no credentials. Move them before you deploy."
  - id: cluster-node-password-to-top-level
    symbols: [IRedisClusterHelperProps, IRedisClusterHelperOptions, RedisClusterHelper]
    upgrade:
      before: |
        new RedisClusterHelper({
          name: 'cache-cluster',
          nodes: [
            { host: 'redis-node-1', port: 7000, password: 'cluster-secret' },
            { host: 'redis-node-2', port: 7001, password: 'cluster-secret' },
          ],
        });
      after: |
        new RedisClusterHelper({
          name: 'cache-cluster',
          nodes: [
            { host: 'redis-node-1', port: 7000 },
            { host: 'redis-node-2', port: 7001 },
          ],
          username: 'app-user', // new: omit it for the default user
          password: 'cluster-secret',
        });
    downgrade:
      steps:
        - "Put password back on each entry of nodes, and drop the top-level username and password. Nodes found after startup get no password again."
    data: "A JavaScript caller that still passes nodes[].password has it ignored: set the top-level password before you deploy, or the nodes answer NOAUTH. An explicit clusterOptions.redisOptions.username or password still wins over the top-level ones."
---

# Changelog - 2026-11-13

## Redis helpers take credentials in one shape, with the Sentinel and cluster-node ones in their own place

<Badge type="warning" text="Breaking Change" />

**In one line.** In single, Sentinel and cluster, top-level `username` and `password` are the data nodes' credentials; whatever else you authenticate to has its own scope.

## What changed

- **Sentinel.** Everything that belongs to Sentinel moves into `sentinel`: `masterName`, `role`, `sentinels` (now `nodes`), `sentinelUsername` and `sentinelPassword` (now `username` and `password`). `password`, `database` and the lifecycle fields stay top-level. New top-level `username` is the data-node ACL user, which Sentinel had no field for.
- **Cluster.** New top-level `username` and `password` apply to every node. They go through `redisOptions`, so nodes found after startup get them too. `nodes[].password` is gone: ioredis applies a per-node password to the startup nodes only, so replicas, failovers and reconnects answered `NOAUTH`. An explicit `clusterOptions.redisOptions.username` or `password` still wins.
- **Single.** `port` is optional now and defaults to `6379`. Nothing else changes.
- **Shared types.** `IRedisNode` (`host`, `port?`) and `IRedisCredentials` (`username?`, `password?`) are exported; the three props types are built from them. A node carries no credentials in any mode.

## Who is affected

- **Apps that build a `RedisSentinelHelper`, or pass `nodes[].password` to a `RedisClusterHelper`.** Move the fields: see the migration below.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> The types change, so the typecheck names each line. A JavaScript caller gets no such help and its old fields are ignored: check the `data` notes of the migration.

**Before:**

```typescript
new RedisSentinelHelper({
  name: 'ha-cache',
  masterName: 'mymaster',
  sentinels: [{ host: '10.0.0.1' }],
  sentinelPassword: 'sentinel-secret',
  password: 'data-secret',
});
```

**After:**

```typescript
new RedisSentinelHelper({
  name: 'ha-cache',
  sentinel: { masterName: 'mymaster', password: 'sentinel-secret', nodes: [{ host: '10.0.0.1' }] },
  password: 'data-secret',
});
```
