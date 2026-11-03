---
title: An Inherited Property Name Is No Longer Read as a Value
description: "Duration unit conversion, the application environment, secrets, the TCP client registry and the high-frequency logger no longer answer 'constructor' or 'toString' with a member of Object.prototype."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-10-25

## An inherited property name is no longer read as a value

<Badge type="info" text="Bug Fix" />

**In one line.** Looking up `'constructor'`, `'toString'` or `'__proto__'` in a helper's plain-object table now finds nothing, like any other unknown name.

## What changed

- **Duration units.** `DurationMultipliers.toMilliseconds`, `fromMilliseconds` and `convert` returned `NaN` for a unit named `constructor` or `toString` instead of the documented `null`. They now return `null`.
- **Environment and secrets.** `ApplicationEnvironment.get('constructor')` returned `Object`, and a secrets provider asked for a key named `toString` returned a function; both ignored the `defaultValue`. An unknown name now reads as unset.
- **TCP server.** `NetworkTcpServer.getClient({ id: 'constructor' })` returned `Object` instead of `undefined`.
- **Worker bus.** A bus key such as `__proto__` is now an ordinary key in `BaseWorker`.
- **High-frequency logger.** `HfLogger.log` given a level that only exists on `Object.prototype` now writes the entry as `info`.

## Who is affected

No action needed. Code that passed a unit, key or id from outside the program to these helpers now gets `null`, `undefined` or the default, as documented.
