---
title: assertApplicationBoots says what it does not stub - components run for real
description: "Docs and JSDoc fix for @venizia/ignis/testing: the helper skips datasource connections, the secrets provider and the socket; components run, so one that needs Redis, Kafka or S3 goes in skipComponents. Ships in 0.4.5."
packages: ['@venizia/ignis']
---

# Changelog - 2026-10-28

## assertApplicationBoots says what it does not stub - components run for real

<Badge type="info" text="Enhancement" />

**In one line.** The 0.4.4 notes said the helper proves a boot "without infrastructure". It skips datasource connections, the secrets provider and the socket; components run for real. Wording only, no behaviour change. Ships in 0.4.5.

## What changed

- The JSDoc of `assertApplicationBoots`, the testing tutorial, the knowledge page and the comment of the preset's `src/boot.test.ts` now name what is stubbed and what is not.
- A component that opens Redis, Kafka or S3 in `binding()` runs that code in a test. Name it in `skipComponents`; the services that depend on it then need `skipBindings`.

## Why components are not skipped by default

A component's `binding()` is what registers the services, controllers and datasources the verification resolves. Skipping every component would make the check pass by looking at less, and IGNIS cannot know which component touches the network.

## Who is affected

Nobody has to change anything. An application whose boot test hung or failed on a component that needs infrastructure now finds the answer in the tutorial.
