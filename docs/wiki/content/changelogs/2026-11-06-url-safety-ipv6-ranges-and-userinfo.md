---
title: The url guard refuses NAT64, 6to4, multicast and documentation IPv6 addresses, and any url with credentials
description: "UrlPolicy.isNonPublicAddress expands an IPv6 address before it classifies it and covers the ranges the prefix test missed. UrlPolicy.assertSafeUrl refuses a url with a username or a password."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## The url guard refuses NAT64, 6to4, multicast and documentation IPv6 addresses, and any url with credentials

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** `UrlPolicy.assertSafeUrl` let a literal IPv6 url reach an internal address, for example the cloud metadata IP through NAT64 (`https://[64:ff9b::a9fe:a9fe]/`), and accepted `https://user:pass@host/`. Both are refused now.

## What changed

- **IPv6 ranges.** `isNonPublicAddress` expands an address to its eight groups before it classifies it, so every spelling of an address gets one answer (`0:0:0:0:0:0:0:1` is loopback, as `::1` is). An address that carries an IPv4 one is judged by the IPv4 rules: NAT64 (`64:ff9b::/96`), 6to4 (`2002::/16`), IPv4-compatible (`::a.b.c.d`) and the v4-mapped forms. Multicast (`ff00::/8`), site-local (`fec0::/10`), documentation (`2001:db8::/32`, `3fff::/20`), the IETF protocol assignments `2001::/23` (Teredo among them), discard (`100::/64`), SRv6 (`5f00::/16`), the rest of `64:ff9b::/32` and the reserved `::/8` are non-public. A string that is not an IPv6 literal fails closed, and so does a string longer than any IPv6 text.
- **Userinfo.** `assertSafeUrl` refuses a url with a username or a password with `URL_REFUSED`. There is no policy flag to allow it: a credential in a url is a way to smuggle a different host past a reviewer or a log line, and a webhook url never needs one.
- **Canonical IPv4 text.** `isNonPublicAddress` reads dotted decimal without leading zeros. `0177.0.0.1` (octal to some parsers), `1e2.0.0.1` and `1.2.3.0000` answer `true` instead of being read as a number. A url never reaches this: `new URL` canonicalises it first.
- **Documented.** `isNonPublicAddress` takes an IP literal only; a domain name answers `true`. An empty userinfo (`https://@host/`) carries no credentials and passes.

## Who is affected

- **Code that fetches a url from an untrusted source through `UrlPolicy`, `UrlIngest` or `fetchGuarded`.** Urls that pointed at those IPv6 ranges, or that carried credentials, are refused now.
- **Code that sent credentials in the url on purpose.** Send them in a header instead.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A url with a username or a password, and an IPv6 literal in the ranges above, were accepted before and are refused now.

## Details

| File | Package |
|------|---------|
| `src/modules/network/utilities/url-safety/policy.ts` | helpers |
