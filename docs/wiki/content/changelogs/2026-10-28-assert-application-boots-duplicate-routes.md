---
title: assertApplicationBoots no longer reports a route with a validator chain as a duplicate
description: "Fix in @venizia/ignis/testing: the duplicate-route check counted one controller once per handler of a route, so any route with authenticate, authorize or a validator was reported as mounted more than once. Ships in 0.4.5."
packages: ['@venizia/ignis']
---

# Changelog - 2026-10-28

## assertApplicationBoots no longer reports a route with a validator chain as a duplicate

<Badge type="info" text="Bug Fix" />

**In one line.** The duplicate-route check of `assertApplicationBoots` reported a false positive for every route that carries middleware; it counts a controller once per method and path now. Ships in 0.4.5.

## What was wrong

Hono's router lists one entry per handler: a route with an authenticate step, an authorize step and a validator is three or more entries with the same method and path. The check appended the controller once per entry, so one route looked like the same route mounted several times, and the helper rejected a healthy application with "routes are mounted more than once, and only the first one answers". Applications whose routes all carry a chain failed on every route.

## What changed

- A controller counts once per method and path, however many handlers the route has.
- A real duplicate is still reported: two different controllers on the same method and path, or one controller that declares the same method and path twice through decorators (the message then says `(declared 2 times)`).
- Not detected: a method and path that a controller declares twice inside `binding()`. The router cannot tell that from a handler chain.

## Who is affected

Applications that passed `{ routes: false }` to `assertApplicationBoots` only to get past this false positive can drop the option on 0.4.5. Nothing else changes.
