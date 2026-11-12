---
title: Mail drops three unused validators and types setProcessor as sync or async
description: "MailQueueExecutorTypes, BullMQExecutorModes and MailBackoffTypes lose isValid and their value sets, IMailQueueExecutor.setProcessor returns ValueOrPromise<void>, and a thrown non-Error reaches the send result as its text."
packages: ['@venizia/ignis']
migration:
  - id: mail-validators-removed
    symbols: [MailQueueExecutorTypes.isValid, MailQueueExecutorTypes.SCHEME_SET, BullMQExecutorModes.isValid, BullMQExecutorModes.MODE_SET, MailBackoffTypes.isValid, MailBackoffTypes.SCHEME_SET]
    upgrade:
      before: |
        MailQueueExecutorTypes.isValid(value);
      after: |
        const queueExecutorTypes = new Set<string>(Object.values(MailQueueExecutorTypes));
        queueExecutorTypes.has(value);
    downgrade:
      steps:
        - "Call the static validators again; they exist in 0.4.8-13 and the constant values are the same."
  - id: mail-set-processor-type
    symbols: [IMailQueueExecutor.setProcessor]
    upgrade:
      before: |
        executor.setProcessor(processor);
      after: |
        await executor.setProcessor(processor);
    downgrade:
      steps:
        - "Remove the await; the older type was void."
---

# Changelog - 2026-11-12

## Mail drops three unused validators and types setProcessor as sync or async

<Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Enhancement" />

**In one line.** Three mail constant classes lose a validator nobody called, and the executor interface now says what the BullMQ executor already did.

## What changed

- **Removed.** `MailQueueExecutorTypes.isValid` and `SCHEME_SET`, `BullMQExecutorModes.isValid` and `MODE_SET`, `MailBackoffTypes.isValid` and `SCHEME_SET`. The constants themselves are unchanged.
- **`setProcessor` is `ValueOrPromise<void>`.** `IMailQueueExecutor.setProcessor` was typed `void`, but `BullMQMailExecutorHelper.setProcessor` is async. The type now allows both, so `await executor.setProcessor(...)` is correct for every executor.
- **A thrown non-Error keeps its text.** When a transport throws something that is not an `Error`, the failed send result carries its text instead of the fixed words `Unknown error`.

## Who is affected

- **Code that calls the removed validators.** Compare with the constants yourself, for example `Object.values` is not available on a const class, so keep your own set.
- **Everyone else.** No action needed.
