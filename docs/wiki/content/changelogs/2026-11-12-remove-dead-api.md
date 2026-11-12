---
title: Mail queue config is a union on type, StaticAssetServe is exported, and three unused APIs are removed
description: "TMailQueueExecutorConfig requires the options its executor needs, StaticAssetServe is exported with resolveServedContentType and applyValidators, StaticAssetControllerFactory.resolveServedContentType and ITemplate.render are removed, and BaseStorageHelper.getObjectStream is not implemented by the base."
packages: ['@venizia/ignis', '@venizia/ignis-helpers']
---

# Changelog - 2026-11-12

## Mail queue config is a union on type, StaticAssetServe is exported, and three unused APIs are removed

<Badge type="warning" text="Breaking" /> <Badge type="tip" text="Enhancement" />

**In one line.** The mail queue config states what each executor needs in its type, the serve helpers of the static-asset component are reachable from the package, and code nothing used is gone.

## What changed

- **Mail queue config.** `IMailQueueExecutorConfig` is now `TMailQueueExecutorConfig`, a union on `type`: `{ type: DIRECT }`, `{ type: INTERNAL_QUEUE; options }` and `{ type: BULLMQ; options }`. The per-type fields `internalQueue` and `bullmq` become `options`. The compiler now refuses an executor without its options, so the runtime errors `Internal queue configuration is missing` and `BullMQ configuration is missing` are gone. The direct executor declares `options?: never`.
- **`StaticAssetServe` is exported.** `StaticAssetServe.resolveServedContentType` and `StaticAssetServe.applyValidators({ ctx, stat })` are reachable from `@venizia/ignis/static-asset`, so a hand-written route makes the same content-type and `304` decisions as the built-in ones. `applyValidators` shipped without an export before.
- **Removed: `StaticAssetControllerFactory.resolveServedContentType`.** It only forwarded to `StaticAssetServe.resolveServedContentType`. The codemod mapping for the old function name now points at `StaticAssetServe`.
- **Removed: `ITemplate.render`.** Nothing read or wrote it.
- **`BaseStorageHelper.getObjectStream` is not implemented by the base.** The base class buffered a full read to cut a byte range out of it, and both shipped helpers (`BunS3Helper`, `DiskHelper`) already override it. The base now throws `is not supported by this helper`, like the other operations a helper has no transport for. The `IStorageHelper` contract is unchanged.

## Who is affected

- **Apps that bind `MAIL_QUEUE_EXECUTOR_CONFIG`.** Rename `internalQueue` and `bullmq` to `options`, and the type to `TMailQueueExecutorConfig`.
- **Apps that call `StaticAssetControllerFactory.resolveServedContentType`.** Call `StaticAssetServe.resolveServedContentType` with the same options.
- **Apps with a custom storage helper that extends `BaseStorageHelper` and relied on the default `getObjectStream`.** Implement `getObjectStream` in the helper.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> `internalQueue` and `bullmq` are no longer config keys, `StaticAssetControllerFactory.resolveServedContentType` and `ITemplate.render` are removed, and `BaseStorageHelper.getObjectStream` throws unless a helper overrides it.

**Before:**

```typescript
this.bind({ key: MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG }).toValue({
  type: MailQueueExecutorTypes.INTERNAL_QUEUE,
  internalQueue: { identifier: 'mail' },
});

const served = StaticAssetControllerFactory.resolveServedContentType({ helper, object });
```

**After:**

```typescript
this.bind({ key: MailKeys.MAIL_QUEUE_EXECUTOR_CONFIG }).toValue({
  type: MailQueueExecutorTypes.INTERNAL_QUEUE,
  options: { identifier: 'mail' },
});

const served = StaticAssetServe.resolveServedContentType({ helper, object });
```

See the [mail API reference](/extensions/components/mail/api#queue-executor-options-tmailqueueexecutorconfig) and [Served content type](/extensions/components/static-asset/api#served-content-type).
