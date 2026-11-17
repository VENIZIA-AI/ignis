---
title: The S3 helper accepts only a DNS label as a bucket in virtual-hosted mode
description: "With virtualHostedStyle, a bucket name that is not one lower-case DNS label is refused before it becomes part of a host."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-06

## The S3 helper accepts only a DNS label as a bucket in virtual-hosted mode

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** With `virtualHostedStyle: true` the bucket name becomes a label of the request host. A name that is not a single lower-case DNS label is now refused instead of being placed in the host.

## What changed

- **One label.** In virtual-hosted mode a bucket must be 1 to 63 characters of `a-z`, `0-9` and hyphen, starting and ending with a letter or digit. Anything else throws before a URL is built. This applies to every call that builds a host, presigned URLs included.
- **Path style is unchanged.** The bucket stays in the path with the rules it had.

## Who is affected

- **Buckets with a dot or an upper-case letter used in virtual-hosted mode.** A dotted bucket does not work with the wildcard certificate of virtual-hosted endpoints, and a host is lower-case, so these were not reliable before. Use path style for them.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/modules/storage/bun-s3/helper.ts` | helpers |
