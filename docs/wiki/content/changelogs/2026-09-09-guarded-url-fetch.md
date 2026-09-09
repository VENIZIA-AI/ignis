---
title: A Url From User Input Can No Longer Reach Inside Your Network
description: UrlPolicy and UrlIngest refuse non-public addresses, re-check every redirect hop and cap the body. AssetIngest.fromUrl stores a remote object without buffering it. IStorageHelper gains writeStream.
---

# Changelog - 2026-09-09

## A url from user input can no longer reach inside your network

<Badge type="danger" text="Security" />

**In one line.** `fetch(url)` on a url your users supplied lets them read your cloud credentials;
`UrlIngest.fetchGuarded` does not.

```ts
import { UrlIngest } from '@venizia/ignis-helpers';

const response = await UrlIngest.fetchGuarded({ url: untrustedUrl });
```

## The problem it solves

A product import, a webhook registration, an avatar-by-url field: each takes a url from a user and
fetches it. `http://169.254.169.254/latest/meta-data/iam/security-credentials/` is a url. So is
`http://localhost:6379/`. A plain `fetch` follows both.

Checking the hostname is not enough, and neither is checking one resolved address:

| Bypass | What stops it |
|---|---|
| `http://169.254.169.254/` | the literal address is checked before anything connects |
| `http://evil.test/` resolving to `127.0.0.1` | every resolved address is checked, not the name |
| a host with one public and one internal A record | **any** non-public address rejects the whole host |
| `https://good.test/` redirecting to `http://10.0.0.5/` | every hop is re-checked, not just the first |
| `::ffff:169.254.169.254` | an IPv4 address inside an IPv6 wrapper is unwrapped and checked |
| a body that never ends | the read is capped and cancels |

## Two halves, because one of them runs in a browser

`UrlPolicy.assertSafeUrl` decides everything that needs no network - scheme, host allow-list, and a literal
address against 16 non-public ranges. It is exported from `@venizia/ignis-helpers/core` and stays
browser-pure.

`UrlIngest` needs `node:dns` and lives on the root barrel.

```ts
import { UrlPolicy } from '@venizia/ignis-helpers/core';   // pure
import { UrlIngest } from '@venizia/ignis-helpers';        // node
```

## The policy is per call

| Option | Default | Meaning |
|---|---|---|
| `allowedSchemes` | `['https:']` | `http:` is available; pass it when your inputs need it |
| `allowPrivateAddress` | `false` | **Turning this on in a path that takes user input re-opens the hole** |
| `allowedHosts` | none | when set, nothing outside the list passes |
| `maxRedirects` | `3` | each hop re-checked |
| `timeout` | 10 seconds | an `IDuration`; a slow host holds a worker slot exactly this long |
| `maxBytes` | 10 MB | the read cancels the moment it is crossed |

Nothing is a build-time constant. An app that must reach plain `http` says so at the call site
rather than weakening the default for everyone.

## A refusal is not a failure - tell them apart before you retry

A url the policy refuses is refused forever. A host that timed out is not. A worker that retries
both turns the guard into a slow repeat scanner, and leaves the failed jobs resident:

```ts
import { isUrlRefusedError, UrlIngest } from '@venizia/ignis-helpers';

try {
  const response = await UrlIngest.fetchGuarded({ url: job.data.imageUrl });
  // ...
} catch (error) {
  if (isUrlRefusedError({ error })) {
    // Permanent: a bad scheme, a non-public address, a host outside the allow-list, a malformed
    // url, too many hops, or a body over the cap. Drop the job; the next attempt gets the same answer.
    return;
  }

  throw error; // A timeout, a DNS failure, a 5xx - worth another attempt.
}
```

Every refusal carries `core.url_safety.url_refused`. Retry policy stays yours; the guard only makes
the distinction expressible.

## An oversized body leaves nothing behind

`AssetIngest.fromUrl` refuses on `content-length` before the write starts, so a body that declares
its size never opens a multipart upload. One that lies or omits the header is caught mid-flight by
`UrlIngest.capStream`, and Bun's S3 client answers a body-stream error with `AbortMultipartUpload` -
verified against a recording endpoint, not assumed. Either way no orphaned parts are billed.

## What is NOT closed

Between the address check and the connect, DNS can answer differently - a rebinding window. Closing
it means connecting to the resolved address and setting `Host` by hand, which no `fetch` API exposes.
The guard narrows the attack to that window; it does not shut it.

## Storing a remote object without buffering it

```ts
import { AssetIngest } from '@venizia/ignis/static-asset';

const { upload, stat } = await AssetIngest.fromUrl({
  helper,
  url: entry.imageUrl,
  bucket: { name: 'assets' },
  folderPath: `${organizerId}/${merchantId}/images`,
  policy: { allowedSchemes: ['http:', 'https:'] },
});
```

The guarded response body is handed straight to `writeStream`, so the bytes never land in the
process. The stored content type is decided from the object KEY, never from what the remote host
claimed - the same rule the asset routes apply.

It returns `{ upload, stat }` and **writes no meta link**. The columns an application attaches to an
object - a principal, a variant - come from its own domain rather than from the object, so the row
stays yours. `stat` is handed back because `getStat` already ran to size the result, so writing your
own row costs no second round trip.

**There is no queue.** Scheduling is the application's, and `AssetIngest.fromUrl` is an ordinary
async call you make from whatever worker you already run.

## IStorageHelper gains writeStream

<Badge type="warning" text="Behavior Change" />

`writeStream` was a `BunS3Helper` method; it is on the interface now, with a base implementation that
buffers and a `BunS3Helper` override that does not.

```ts
writeStream(opts: IObjectLocation & {
  source: ReadableStream<Uint8Array> | Blob | Response | Request;
  contentType?: string;
}): Promise<void>;
```

**Wrote your own `IStorageHelper`?** You inherit the buffering default from `BaseStorageHelper` and
need do nothing. Override it if your backend takes a stream.

The reason it is on the interface: without a named streaming seam, every consumer buffers the whole
object to satisfy `upload()`, and then wonders where the memory went.

## Who is affected

**You fetch a url that came from user input.** Move to `UrlIngest.fetchGuarded`. This is the one that matters.

**You want remote objects stored.** `AssetIngest.fromUrl` is new; nothing changed under you.

**Everyone else.** Nothing to do.

## Credit

The address list, the `dns.lookup(host, { all: true })` rule, and the mutation control this was
verified against came from the BANA team, contributed at
`agent-contracts/ignis/2026-09-08-ssrf-fetch-guard-input.md`.
