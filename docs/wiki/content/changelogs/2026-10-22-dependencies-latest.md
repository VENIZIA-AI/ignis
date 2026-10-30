---
title: Dependencies at Their Latest, Eight Peer Majors Raised
description: "Peer floors now ask for the newest major of ioredis, bullmq, nodemailer, mailgun.js, @scalar/hono-api-reference, meilisearch, node-vault and eslint-plugin-unicorn."
packages: ['@venizia/ignis', '@venizia/ignis-helpers', '@venizia/ignis-connectors', '@venizia/dev-configs']
---

# Changelog - 2026-10-22

## Dependencies at their latest, eight peer majors raised

<Badge type="warning" text="Breaking" />

**In one line.** Peer floors now ask for the newest major. Upgrade these in your app with IGNIS.

| Peer | Was | Now | Watch for |
|---|---|---|---|
| `ioredis` | ^5 | ^6 | Node 20+; RESP3 on the wire, reply shapes unchanged (default `replyMapping: 'legacy'`) |
| `bullmq` | ^5 | ^6 | Removed: `Queue#client`, repeatable jobs, `Job#discard`, `paused` state; `Worker#resume()` async |
| `nodemailer` | ^8 | ^10 | Node 20+; TLS certificates validated for OAuth2 token and proxy requests |
| `mailgun.js` | ^13 | ^14 | IP pools on the v3 API |
| `@scalar/hono-api-reference` | ^0.11 | ^0.12 | None for IGNIS |
| `meilisearch` | ^0.59 \|\| ^0.60 | ^0.62 | None for IGNIS |
| `node-vault` | ^0.12 | ^0.13 | Behind `HTTPS_PROXY`, the proxy must allow `CONNECT` to Vault |
| `eslint-plugin-unicorn` (dev-configs) | ^74 | ^78 | None for the presets |

## Who is affected

An app that uses Redis, queues, mail, Meilisearch or Vault through IGNIS: raise those packages with the IGNIS upgrade. Reaching `BullMQHelper.queue.client` or repeatable jobs breaks on bullmq 6.

## Details

- Held back: `@libsql/client` stays below 0.18, `tsc-alias` stays `1.9.4`, and `typescript` stays 6.
