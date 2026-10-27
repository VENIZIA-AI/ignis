---
title: assertApplicationBoots names skipComponents when a boot fails inside a component
description: "Enhancement in @venizia/ignis/testing: when the boot fails inside a component, the helper logs one warning naming it and skipComponents. The rejection stays the original error. Ships in 0.4.5."
packages: ['@venizia/ignis']
---

# Changelog - 2026-10-28

## assertApplicationBoots names skipComponents when a boot fails inside a component

<Badge type="tip" text="Enhancement" />

**In one line.** A component that opens Redis, Kafka or S3 in `binding()` runs for real in a boot test. When it fails, the helper now logs one warning that names it and the way out. Ships in 0.4.5.

## What changed

- When the boot rejects while a component's `configure()` is running, `assertApplicationBoots` logs one warning: `skipComponents: ['Name']` skips it, and `skipBindings` lists the services that depend on it. A nested component is named by the innermost one that was running.
- The rejection is never wrapped: it is still the error the component raised.
- A failure outside a component, or after every component finished, logs nothing new.

## Who is affected

Nobody has to change anything. A boot test that failed on a component that needs infrastructure now says what to do in its log.
