---
title: A Failed Secret Rotation Left the Rotated Credentials in the Datasource Settings
description: "After a failed onSecretRotated(), a datasource kept the rotated user and password in its settings when they were not there before; fixed in 0.4.4 for every relational and raw-SQL datasource."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-26

## A failed secret rotation left the rotated credentials in the datasource settings

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** After a failed `onSecretRotated()`, a datasource kept the rotated `user` and `password` in its settings when those keys had not been there before. It now removes them. Ships in 0.4.4.

## What changed

- **The restore after a failed rotation also removes any key the rotation added,** so the settings are exactly what they were. Before, it put back keys that existed before but left a key the rotation added.
- **Where.** Every relational datasource (Postgres, SQLite) and the new raw-SQL family. Releases `0.2.0` to `0.4.3` of `@venizia/ignis` and `@venizia/ignis-connectors` have the leak; 0.4.4 has the fix.

## Who is affected

- **You rotate credentials through Vault (or call `onSecretRotated()`), and your datasource settings do not hold `user` or `password`.** A connection string or an environment variable carries the credential instead. A failed rotation left the rejected credential in `getSettings()`, where logging, diagnostics and the next rebuild read it. Update, then check what read the settings after a failed rotation.
- **Your settings already hold `user` and `password`.** Not affected.
- **You never rotate secrets.** No action needed.
