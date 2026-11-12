---
title: RedisSingleHelper takes a Redis ACL username
description: "RedisSingleHelper accepts username and sends it to ioredis with the password, so a single node that uses ACL users can be reached without a hand-built client."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-12

## RedisSingleHelper takes a Redis ACL username

<Badge type="tip" text="New Feature" />

**In one line.** A single Redis node that uses ACL users (`AUTH <user> <password>`) is now one option away: pass `username`.

## What changed

- **`username` on `RedisSingleHelper`.** It goes to ioredis beside `password`. Left out, the helper authenticates as the `default` user, as before.
- **Cluster and sentinel need no change.** A cluster takes it as `clusterOptions.redisOptions.username`; a sentinel takes `sentinelUsername` and `sentinelPassword` for the sentinels and `redisOptions.username` for the data nodes.

## Who is affected

- **Apps whose Redis uses ACL users on a single node.** Add `username`.
- **Everyone else.** No action needed.
