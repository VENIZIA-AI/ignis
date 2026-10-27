---
title: Dependencies at Their Latest, Eight Peer Majors Raised
description: 'Every floor at its newest release; ioredis 6, bullmq 6, nodemailer 10, mailgun.js 14, @scalar/hono-api-reference 0.12, meilisearch 0.62, node-vault 0.13, eslint-plugin-unicorn 78.'
packages:
  ['@venizia/ignis', '@venizia/ignis-helpers', '@venizia/ignis-connectors', '@venizia/dev-configs']
---

# Changelog - 2026-10-22

## Dependencies at their latest, eight peer majors raised

<Badge type="warning" text="Breaking" />

**In one line.** Peer floors now ask for the newest major. Upgrade these in your app with IGNIS.

| Peer                                  | Was              | Now   | Watch for                                                                                        |
| ------------------------------------- | ---------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `ioredis`                             | ^5               | ^6    | Node 20+; RESP3 on the wire, reply shapes unchanged (default `replyMapping: 'legacy'`)           |
| `bullmq`                              | ^5               | ^6    | Removed: `Queue#client`, repeatable jobs, `Job#discard`, `paused` state; `Worker#resume()` async |
| `nodemailer`                          | ^8               | ^10   | Node 20+; TLS certificates validated for OAuth2 token and proxy requests                         |
| `mailgun.js`                          | ^13              | ^14   | IP pools on the v3 API                                                                           |
| `@scalar/hono-api-reference`          | ^0.11            | ^0.12 | None for IGNIS                                                                                   |
| `meilisearch`                         | ^0.59 \|\| ^0.60 | ^0.62 | None for IGNIS                                                                                   |
| `node-vault`                          | ^0.12            | ^0.13 | Behind `HTTPS_PROXY`, the proxy must allow `CONNECT` to Vault                                    |
| `eslint-plugin-unicorn` (dev-configs) | ^74              | ^78   | None for the presets                                                                             |

Every other floor sits at the newest release of its major.

## Held back

- `@libsql/client` 0.18: its connection pool rolls back a raw `BEGIN`; the sqlite transactions need a redesign first.
- `tsc-alias` stays `1.9.4`: 1.9.8 rewrites `drizzle-orm/pg-core` to `.../index.js`.
- `typescript` stays 6: `typescript-eslint` and `ignis-boot` need the TypeScript 6 API.

## Who is affected

An app that uses Redis, queues, mail, Meilisearch or Vault through IGNIS: raise those packages with the IGNIS upgrade. Reaching `BullMQHelper.queue.client` or repeatable jobs breaks on bullmq 6.
