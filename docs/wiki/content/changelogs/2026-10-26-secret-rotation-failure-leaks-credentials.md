---
title: A Failed Secret Rotation Left the Rotated Credentials in the Datasource Settings
description: "When onSecretRotated() failed, the datasource restored the settings keys it had before but kept the rotated user and password if the settings had not held those keys. Fixed for every relational and raw-SQL datasource; affects @venizia/ignis and @venizia/ignis-connectors 0.2.0 to 0.4.3."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-26

## A failed secret rotation left the rotated credentials in the datasource settings

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** After a failed `onSecretRotated()`, a datasource kept the rotated `user` and `password` in its settings when those keys had not been there before. It now removes them.

## What changed

- **Before.** The rotation copied the new `user` and `password` onto the datasource settings, then tried to rebuild. On failure the old client kept serving, and the settings were restored with `Object.assign(settings, saved)`. That puts back keys that existed before, but leaves a key the rotation added.
- **After.** The restore also removes any key the rotation added, so the settings are exactly what they were.
- **Where.** The code is in the shared driver base of every relational datasource (Postgres, SQLite) and the new raw-SQL family. Releases `0.2.0` to `0.4.3` of `@venizia/ignis` and `@venizia/ignis-connectors` have the leak; the first release after this entry has the fix.

## Who is affected

- **You rotate credentials through Vault (or call `onSecretRotated()`), and your datasource settings do not hold `user` or `password`.** A connection string or an environment variable carries the credential instead. A failed rotation left the rejected credential in `getSettings()`, where logging, diagnostics and the next rebuild read it. Update, then check what read the settings after a failed rotation.
- **Your settings already hold `user` and `password`.** Not affected: the restore put the old values back.
- **You never rotate secrets.** No action needed.
