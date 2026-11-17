---
title: Socket.IO broadcasts reach authenticated sockets only
description: "SocketIOServerHelper.send with no destination used to emit to every connected socket, the ones that had not authenticated included. It now goes to a room every authenticated socket joins."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-11-06

## Socket.IO broadcasts reach authenticated sockets only

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** `SocketIOServerHelper.send({ payload })` without a destination emitted to every connected socket. A socket that has not authenticated could listen to it. It now goes to a room that only authenticated sockets join.

## What changed

- **A room for the authenticated.** After authentication a socket joins `SocketIOConstants.ROOM_AUTHENTICATED` (`io-authenticated`) besides the `defaultRooms` you configured, so a broadcast reaches it even when you replaced the default rooms.
- **Send with no destination.** It is emitted to that room, as the WebSocket helper already restricted its broadcast to authenticated clients. A send with a destination is unchanged.

## Who is affected

- **Apps that broadcast with `send` and no destination.** Authenticated sockets receive it as before; an unauthenticated socket no longer does.
- **Apps that relied on an unauthenticated socket receiving a broadcast** (a public channel). Give it a room and send to that room.

## Details

| File | Package |
|------|---------|
| `src/modules/socket/socket-io/server/helper.ts` | helpers |
| `src/modules/socket/socket-io/common/constants.ts` | helpers |
