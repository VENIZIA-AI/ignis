---
title: A Guide for Using IGNIS in a Browser or Web Worker
description: "A new guide lists the entries that bundle for a browser or Web Worker, a Vite config that needs no Node polyfill, and how to find the import that pulls in Node builtins. No code changes."
packages: []
---

# Changelog - 2026-10-25

## A guide for using IGNIS in a browser or Web Worker

<Badge type="tip" text="Enhancement" />

**In one line.** [Using IGNIS in a Browser or Web Worker](/guides/core-concepts/browser-and-web-worker) shows how to bundle the worker, kernel, inversion and filter packages with plain `vite build` and no polyfill plugin.

## What changed

- **A new guide.** It lists the browser-safe entries of each package, a minimal worker entry, main-thread entry and `vite.config.ts`, and when `define: { global: 'globalThis' }` helps.
- **A leak finder.** It explains how to trace a `Module "node:crypto" has been externalized` warning back to the import of the `@venizia/ignis-helpers` root that causes it.

## Who is affected

- **Apps that bundle IGNIS for a browser or Web Worker.** No action needed. If you added `vite-plugin-node-polyfills` for IGNIS, check whether a helpers-root import was the cause and remove it.
- **Everyone else.** No action needed. No package code changed.
