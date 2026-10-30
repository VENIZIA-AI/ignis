---
title: One Endpoint Option, Two Audiences
description: "BunS3Helper takes endpoint: { default, public? }; the default host is what this process talks to, and the public host is what a browser is handed in signed URLs."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-09-15

## One endpoint option, two audiences

<Badge type="danger" text="Breaking" />

**In one line.** `endpoint` is now an object, and the two hosts do different jobs.

## What changed

- **`endpoint: { default, public? }`.** `default` is what this process talks to. `public` is what a browser is handed, and falls back to `default`, so one reachable host still serves both.
- **Behaviour changed, not only the shape.** `publicEndpoint` used to win for everything, so list, copy and tagging calls also went out through the public host. Now `default` serves the `S3Client`, every bucket operation, `copyObject` and object tagging, and `public` serves only `presignGet`, `presignPut` and `presignPost`.
- **Why two hosts.** The host is inside every signature, so a URL signed against `minio:9000` cannot be rewritten to a public host. The public host has to be chosen at signing time.

## Who is affected

- **You construct `BunS3Helper`.** Wrap the endpoint. A compile error names every site.
- **You set `publicEndpoint`.** Move it to `endpoint.public`, and expect your server traffic to take the internal route now. That is the fix, not a regression.
- **You use `DiskHelper` or the storage contract.** Nothing.

## Breaking changes

> [!WARNING]
> Every `BunS3Helper` construction site changes.

**Before:**

```ts
new BunS3Helper({ accessKey, secretKey, endpoint: 'http://minio:9000', publicEndpoint: 'https://cdn.example.com' });
```

**After:**

```ts
new BunS3Helper({
  accessKey,
  secretKey,
  endpoint: {
    default: 'http://minio:9000',        // what THIS process talks to
    public: 'https://cdn.example.com',   // what a BROWSER is handed
  },
});
```
