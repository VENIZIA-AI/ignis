---
title: A Url From User Input Can No Longer Reach Inside Your Network
description: UrlIngest.fetchGuarded refuses non-public addresses, re-checks every redirect hop and caps the body; AssetIngest.fromUrl stores a remote object without buffering it, and IStorageHelper gains writeStream.
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-09-09

## A url from user input can no longer reach inside your network

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** A plain `fetch(url)` on a url your users supplied lets them reach your cloud credentials or internal services; `UrlIngest.fetchGuarded` does not.

```ts
import { UrlIngest } from '@venizia/ignis-helpers';

const response = await UrlIngest.fetchGuarded({ url: untrustedUrl });
```

## What changed

- **Non-public addresses are refused.** A literal address, every resolved address (not the name), an IPv4 address wrapped in IPv6, and every redirect hop are checked. One internal A record rejects the whole host.
- **The body is capped.** The read cancels the moment `maxBytes` is crossed.
- **Per-call policy.** `allowedSchemes` (default `['https:']`), `allowPrivateAddress` (default `false`; turning it on in a path that takes user input re-opens the hole), `allowedHosts` (when set, nothing outside the list passes), `maxRedirects` (3), `timeout` (10 seconds, an `IDuration`) and `maxBytes` (10 MB).
- **Two halves.** `UrlPolicy.assertSafeUrl` needs no network and is browser-pure, from `@venizia/ignis-helpers/core`. `UrlIngest` needs `node:dns` and lives on the root barrel.
- **Refusal versus failure.** Every refusal carries `core.url_safety.url_refused`. `isUrlRefusedError({ error })` tells a permanent refusal (do not retry) from a timeout, DNS failure or 5xx (worth another attempt). Retry policy stays yours.
- **`AssetIngest.fromUrl`.** Stores a remote object without buffering it, from `@venizia/ignis/static-asset`. It refuses on `content-length` before the write starts, and a body that lies is caught mid-flight, so no orphaned multipart parts are left. It returns `{ upload, stat }` and writes no meta link. The stored content type comes from the object KEY, never from the remote host. There is no queue; you call it from whatever worker you already run.
- **`IStorageHelper.writeStream` (Behavior Change).** It was a `BunS3Helper` method and is now on the interface, with a base implementation that buffers and a `BunS3Helper` override that does not. It takes `maxFolderDepth`, defaulting to the same depth rule `upload` applies.

```ts
const { upload, stat } = await AssetIngest.fromUrl({
  helper,
  url: entry.imageUrl,
  bucket: { name: 'assets' },
  policy: { allowedSchemes: ['http:', 'https:'] },
  resolveKey: () => `${organizerId}/images/${crypto.randomUUID()}.png`,
  maxFolderDepth: 3,
  normalizeLinkFn: ({ object }) => buildObjectLink(object.key),
});
```

## Who is affected

- **You fetch a url that came from user input.** Move to `UrlIngest.fetchGuarded`. This is the one that matters.
- **You want remote objects stored.** `AssetIngest.fromUrl` is new; nothing changed under you.
- **You wrote your own `IStorageHelper`.** You inherit the buffering `writeStream` from `BaseStorageHelper`. Override it if your backend takes a stream.
- **Everyone else.** Nothing to do.

## Details

- **Not closed.** Between the address check and the connect, DNS can answer differently (a rebinding window). Closing it needs a connect-by-address that no `fetch` API exposes. The guard narrows the attack to that window; it does not shut it.
