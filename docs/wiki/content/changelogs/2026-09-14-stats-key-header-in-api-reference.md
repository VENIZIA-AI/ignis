---
title: The Stats Key Header Shows Up In The API Reference
description: GET /health/stats now declares x-health-key in its OpenAPI definition, so the API reference offers an input for the key.
packages: ['@venizia/ignis']
---

# Changelog - 2026-09-14

## The stats key header shows up in the API reference

<Badge type="tip" text="Enhancement" />

**In one line.** `GET /health/stats` declares `x-health-key` as a header parameter, so the API reference renders a box for it.

## What changed

- **A box for the key.** A host that set `stats.secretKey` answered 404 from the explorer with no way to send the key. The header is now declared.
- **The header stays optional.** A host with no `stats.secretKey` runs an open route and needs no key. The description says: "The stats key. A host that configures `stats.secretKey` answers 404 without it."

## Who is affected

- **You set `stats.secretKey`.** The reference now has a box for the key. Nothing changes on the wire.
- **You run an open stats route.** One optional parameter appears in the reference. Requests are unaffected.
- **You call the route from code.** Nothing changes.
