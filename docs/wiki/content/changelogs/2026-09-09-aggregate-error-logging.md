---
title: The Log Names Every Reason An AggregateError Collected
description: ErrorPrettier walked the cause chain but never read .errors, so a protocol client's AggregateError logged one generic sentence and lost every actual reason.
---

# Changelog - 2026-09-09

## The log names every reason an `AggregateError` collected

<Badge type="tip" text="Fix" />

**In one line.** `ErrorPrettier` followed `cause` but never read `.errors`, so an `AggregateError`
logged the wrapper's sentence and nothing else.

Every protocol client gathers failures this way - a Kafka `ResponseError` carries one
`ProtocolError` per rejected topic, `Promise.any` carries one per branch, an ioredis cluster one per
node. Before, the log said only that something failed:

```
- message: Received response with error while executing API Metadata(v12)
- name: AggregateError (code PLT_KFK_RESPONSE)
```

Now it says what:

```
- message: Received response with error while executing API Metadata(v12)
- errors[0]: Topic authorization failed. (code PLT_KFK_PROTOCOL)
- errors[1]: There is no listener on the leader broker that matches the listener on which
             metadata request was processed. (code PLT_KFK_PROTOCOL)
- name: AggregateError (code PLT_KFK_RESPONSE)
```

## Wrapped, too

The members are printed under **whichever** node collected them, so the common shape - a datasource
wrapping the client's error - is not silent either:

```ts
throw new Error('Failed to connect the kafka datasource', { cause: responseError });
```

The text rendering used to read `errors` off the root node only, while the JSON rendering carried
the whole subtree. Text and JSON now agree.

## Bounded like the rest

At most 10 members are rendered; the remainder becomes `... and N more`, the same rule
`compressZodMessage` applies to Zod issues. The cycle guard and the depth budget are the ones the
`cause` walk already used, so a self-referencing aggregate still terminates.

Nothing library-specific is captured. A `ProtocolError`'s `apiId`/`apiCode` are that library's own
keys; its `message` is the human sentence, and that is what is kept.

## Who is affected

**You log a caught error and the client gathers failures.** Your logs gain the reasons. Nothing to
change.

**Everyone else.** Nothing.

## Credit

Found and first patched by the BANA team while tracing a boot failure whose cause the log was
hiding.
