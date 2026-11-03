---
title: RedisSingleHelper takes no password for a Redis that has none
description: "password on IRedisSingleHelperProps is optional, as it already was for cluster and sentinel."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-03

## RedisSingleHelper takes no password for a Redis that has none

<Badge type="tip" text="Enhancement" />

**In one line.** Leave `password` out when your Redis has no password. You no longer pass `''` or cast.

## What changed

- **`password` on `IRedisSingleHelperProps` is optional.** This covers `new RedisSingleHelper({...})` and `RedisHelperFactory.create` in `RedisModes.SINGLE`. Cluster and sentinel already took an optional password.
- **Nothing changes at run time.** The helper passes the value straight to ioredis, as before.

## Who is affected

- **Code that passed `password: ''` or `process.env.X ?? ''`, or cast an `undefined` to `string`.** You can pass the value as it is, `undefined` included.
- **Everyone else.** No action needed.
