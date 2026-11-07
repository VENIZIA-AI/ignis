---
title: jwks.hosts.http accepts an exact IP and a port
description: "An entry of jwks.hosts.http can be a host name, an IPv4 address or a bracketed IPv6 address, each with an optional port. Matching is exact; wildcards, ranges and CIDR stay refused."
packages: ['@venizia/ignis-kernel', '@venizia/ignis']
---

# Changelog - 2026-11-08

## jwks.hosts.http accepts an exact IP and a port

<Badge type="tip" text="Enhancement" /> <Badge type="danger" text="Security" />

**In one line.** A service that publishes its key set over `http:` on an internal address, such as `10.0.0.5:8080`, can now be listed in `jwks.hosts.http`. Before, only host names could be.

## What changed

- **Three kinds of entry.** A host name (`identity-service`), an IPv4 address (`10.0.0.5`) or an IPv6 address in brackets (`[fd00::1]`), each with an optional `:port`.
- **The port.** An entry without a port covers every port of that host, as before. An entry with a port covers that port only: `10.0.0.5:8080` does not cover `10.0.0.5:9090`. A URL with no port is on port 80, so `host:80` covers it.
- **Exact match only.** There are still no wildcards, ranges or CIDR. An address entry never covers a name, and a name entry never covers an address.
- **Read the way the URL parser reads it.** An entry is valid only when `new URL('http://' + entry)` gives the same host back, and the same port. A URL is read by the same parser, so the two sides are compared in the same form. `2130706433`, `0x7f000001`, `010.0.0.5`, `1.2.3` and `[::ffff:10.0.0.5]` refuse the boot as entries, and `http://[::ffff:10.0.0.5]/` does not match the entry `10.0.0.5`.
- **IPv6 in the short form.** Write `[fd00::1]:8443`. `[fd00:0:0:0:0:0:0:1]` refuses the boot, because the parser writes that address as `[fd00::1]`.
- **Still refused at boot.** A scheme, a path, a query, credentials, a wildcard, an empty label, an empty port, a port above 65535, a port of 0, and a port with a leading zero or a sign. The message names the entry.
- **Loopback is still always allowed.**

## Who is affected

- **Apps that reach a key set over `http:` on an IP address.** Add the address, with its port if you want to pin it. Prefer `https:` where you can.
- **Everyone else.** No action needed: every entry that was valid still is, and means the same.

## Details

- A numeric spelling of a listed address reaches the same address: `http://167772165/certs` is `10.0.0.5`, so the entry `10.0.0.5` covers it. That is the same host, not a bypass.
- A host name written with a trailing dot (`http://identity-service./certs`) still does not match the entry `identity-service`.
- The entry `10.0.0.5` covers `10.0.0.5` on any port. If the service listens on one port, write `10.0.0.5:8080`.

| File | Package |
|------|---------|
| `src/components/auth/authenticate/services/jwks-url-policy.ts` | core |
| `src/base/auth/authenticate/common/types/jwt.ts` | kernel |
| `src/base/auth/authenticate/common/types/service.ts` | kernel |
