---
title: The Log Names Every Reason An AggregateError Collected
description: Your logs now show each reason inside an AggregateError instead of one generic sentence.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-09-09

## The log names every reason an `AggregateError` collected

<Badge type="tip" text="Fix" />

**In one line.** `ErrorPrettier` now reads `.errors`, so an `AggregateError` logs each collected reason and not just the wrapper's sentence.

## What changed

- **Each member is logged.** A Kafka `ResponseError`, a `Promise.any` failure or an ioredis cluster error now prints `errors[0]`, `errors[1]` and so on with their messages and codes.
- **Wrapped errors too.** The members are printed under whichever node collected them, so a datasource wrapping the client's error with `{ cause }` is not silent either.
- **Text and JSON agree.** The text rendering used to read `errors` off the root node only, while JSON carried the whole subtree.
- **Bounded.** At most 10 members are rendered; the rest becomes `... and N more`. A self-referencing aggregate still terminates.

```
- message: Received response with error while executing API Metadata(v12)
- errors[0]: Topic authorization failed. (code PLT_KFK_PROTOCOL)
- name: AggregateError (code PLT_KFK_RESPONSE)
```

## Who is affected

- **You log a caught error and the client gathers failures.** Your logs gain the reasons. Nothing to change.
- **Everyone else.** Nothing.
