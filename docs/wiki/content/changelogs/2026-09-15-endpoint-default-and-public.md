---
title: One Endpoint Option, Two Audiences
description: "BunS3Helper takes endpoint: { default, public? }. The default host is what this process talks to; the public host is what a browser is handed, and only signed URLs use it."
---

# Changelog - 2026-09-15

## One endpoint option, two audiences

<Badge type="danger" text="Breaking" />

**In one line.** `endpoint` is now an object, and the two hosts do different jobs.

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

| Before | After |
|---|---|
| `endpoint: 'http://minio:9000'` | `endpoint: { default: 'http://minio:9000' }` |
| `publicEndpoint: 'https://cdn...'` | `endpoint: { public: 'https://cdn...' }` |

The compiler finds every site. `public` is optional and falls back to `default`, so one reachable
host still serves both audiences.

## The behaviour changed, not only the shape

`publicEndpoint` used to win for **everything**:

```ts
const signingEndpoint = options.publicEndpoint ?? options.endpoint;
```

So an application that set it sent its own list, copy and tagging calls to the public host too -
working by accident, and hairpinning every byte back out through the edge. A public host that is a
read-only CDN would not have worked at all.

Now each call states its audience:

| Goes to `default` | Goes to `public` |
|---|---|
| the `S3Client`, every bucket operation, `copyObject`, object tagging | `presignGet`, `presignPut`, `presignPost` |

Measured with a `fetch` double that records the URL actually attempted: `getBuckets()` on
`{ default: 'http://minio:9000', public: 'https://cdn.example.com' }` reaches `minio:9000`.

## Why two hosts at all

`host` is inside every SigV4 signature. A URL signed against `minio:9000` cannot be rewritten to a
public host afterwards - the signature breaks. So the public host has to be chosen **at signing
time**, which is why it is a configured value and not a rewrite step.

## Who is affected

**You construct `BunS3Helper`.** Wrap the endpoint: `endpoint: { default: <what you had> }`. A
compile error names every site.

**You set `publicEndpoint`.** Move it to `endpoint.public`, and expect your server traffic to take
the internal route now. That is the fix, not a regression.

**You use `DiskHelper` or the storage contract.** Nothing.

**Files:**

- [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts) - `IBunS3HelperOptions`, `objectEndpoint`
