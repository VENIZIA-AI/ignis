---
title: "@venizia/ignis-kernel/statuses"
description: "Every export of @venizia/ignis-kernel/statuses, from the built declarations (generated)."
---

# `@venizia/ignis-kernel/statuses`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

2 exports, 2 with TSDoc.

## `CommonStatuses`

*class*

Common reusable entity statuses.

```ts
export declare class CommonStatuses {
    static readonly UNKNOWN = "000_UNKNOWN";
    static readonly ACTIVATED = "201_ACTIVATED";
    static readonly DEACTIVATED = "401_DEACTIVATED";
    static readonly BLOCKED = "403_BLOCKED";
    static readonly ARCHIVED = "405_ARCHIVED";
    static readonly SCHEME_SET: Set<string>;
    static isValid(scheme: string): boolean;
}
```

Source: `packages/kernel/src/common/statuses/common.ts`

## `Statuses`

*class*

Application statuses categorized by lifecycle phase: the leading digit of a code is its phase (0 initial, 1 pending, 2 active, 3 completed, 4 inactive, 5 failed).

```ts
export declare class Statuses {
    static readonly UNKNOWN = "000_UNKNOWN";
    static readonly DRAFT = "001_DRAFT";
    static readonly NEW = "100_NEW";
    static readonly QUEUED = "101_QUEUED";
    static readonly SCHEDULED = "102_SCHEDULED";
    static readonly PENDING = "103_PENDING";
    static readonly IN_REVIEW = "104_IN_REVIEW";
    static readonly OPEN = "105_OPEN";
    static readonly SUBMITTED = "106_SUBMITTED";
    static readonly ENABLED = "200_ENABLED";
    static readonly ACTIVATED = "201_ACTIVATED";
    static readonly RUNNING = "202_RUNNING";
    static readonly PROCESSING = "203_PROCESSING";
    static readonly SENT = "204_SENT";
    static readonly RECEIVED = "205_RECEIVED";
    static readonly READY = "206_READY";
    static readonly PUBLISHED = "207_PUBLISHED";
    static readonly ISSUED = "208_ISSUED";
    static readonly PARTIAL = "300_PARTIAL";
    static readonly APPROVED = "301_APPROVED";
    static readonly SUCCESS = "302_SUCCESS";
    static readonly COMPLETED = "303_COMPLETED";
    static readonly SETTLED = "304_SETTLED";
    static readonly CONFIRMED = "305_CONFIRMED";
    static readonly RESOLVED = "306_RESOLVED";
    static readonly DISABLED = "400_DISABLED";
    static readonly DEACTIVATED = "401_DEACTIVATED";
    static readonly SUSPENDED = "402_SUSPENDED";
    static readonly BLOCKED = "403_BLOCKED";
    static readonly CLOSED = "404_CLOSED";
    static readonly ARCHIVED = "405_ARCHIVED";
    static readonly PAUSED = "406_PAUSED";
    static readonly REVOKED = "407_REVOKED";
    static readonly REFUNDED = "408_REFUNDED";
    static readonly FAIL = "500_FAIL";
    static readonly EXPIRED = "501_EXPIRED";
    static readonly TIMEOUT = "502_TIMEOUT";
    static readonly SKIPPED = "503_SKIPPED";
    static readonly ABORTED = "504_ABORTED";
    static readonly CANCELLED = "505_CANCELLED";
    static readonly DELETED = "506_DELETED";
    static readonly REJECTED = "507_REJECTED";
    static readonly VOIDED = "508_VOIDED";
    static readonly INITIAL_SCHEME_SET: Set<string>;
    static readonly PENDING_SCHEME_SET: Set<string>;
    static readonly ACTIVE_SCHEME_SET: Set<string>;
    static readonly COMPLETED_SCHEME_SET: Set<string>;
    static readonly INACTIVE_SCHEME_SET: Set<string>;
    static readonly FAILED_SCHEME_SET: Set<string>;
    static readonly SCHEME_SET: Set<string>;
    static isInitial(status: string): boolean;
    static isPending(status: string): boolean;
    static isActive(status: string): boolean;
    static isCompleted(status: string): boolean;
    static isInactive(status: string): boolean;
    static isFailed(status: string): boolean;
    static isValid(status: string): boolean;
}
```

Source: `packages/kernel/src/common/statuses/common.ts`
