---
title: A WebSocket client is established only after the encryption handshake
description: "With requireEncryption, a client stays in the authenticating state until the handshake completes; room joins and messages are refused until then."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-06

## A WebSocket client is established only after the encryption handshake

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** With `requireEncryption: true`, a client was marked authenticated before its encryption handshake finished. It now stays `authenticating` until the handshake completes.

## What changed

- **Same state, later.** The client moves to `authenticated` after `handshakeFn` returns. Until then every message and room join is answered with `Not authenticated`, and a second `authenticate` frame is refused.
- **A handshake that hangs** is closed by the existing in-progress authentication timeout (three times `authTimeout`).
- **Without `requireEncryption`** nothing changes.

## Who is affected

Nobody needs to act. A client that sent frames between `authenticate` and the handshake result had them accepted before; they are refused now, so send them after the `connected` event.

## Details

| File | Package |
|------|---------|
| `src/modules/socket/websocket/server/helper.ts` | helpers |
