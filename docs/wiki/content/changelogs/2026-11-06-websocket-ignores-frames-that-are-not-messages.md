---
title: The WebSocket server ignores a frame that is not a JSON object
description: "A first frame such as null, a number, a string or a list no longer throws inside the message handler. It is dropped with a log line, and the connection stays as it was."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## The WebSocket server ignores a frame that is not a JSON object

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** `WebSocketServerHelper` read `event` from the parsed frame without checking its type, so a frame like `null` threw before any authentication. Such a frame is dropped with a log line now.

## What changed

- **A message must be an object with a string `event`.** Anything else (`null`, a number, a string, a list, an `event` that is not a string) is logged and ignored; the client stays connected and unauthenticated, and a later valid message works as usual.
- **The log line carries the length, not the frame.** A rejected frame is logged with the client id and its size, so a flood of large junk frames cannot flood the log.
- **Nothing else changes.** A frame that is not JSON still gets the `Invalid message format` reply.

## Who is affected

- **Servers using `WebSocketServerHelper`.** A client can no longer raise an uncaught exception with one frame.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/modules/socket/websocket/server/helper.ts` | helpers |
