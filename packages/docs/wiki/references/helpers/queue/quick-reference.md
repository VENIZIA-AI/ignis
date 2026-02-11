# Quick Reference

| Class | Extends | Use Case |
|-------|---------|----------|
| **BullMQHelper** | BaseHelper | Redis-backed job queue -- background processing, task scheduling |
| **MQTTClientHelper** | BaseHelper | MQTT broker messaging -- real-time events, IoT |
| **QueueHelper** | BaseHelper | In-memory generator queue -- sequential tasks, single process |

## Common Operations

| Helper | Subscribe/Consume | Publish/Produce |
|--------|-------------------|-----------------|
| **BullMQ** | Create with `role: 'worker'` | `queue.add(name, data)` |
| **MQTT** | `subscribe({ topics })` | `publish({ topic, message })` |
| **In-Memory** | `new QueueHelper({ onMessage })` | `enqueue(payload)` |

::: details Import Paths
```typescript
// Via core (re-exports helpers)
import { BullMQHelper, QueueHelper, MQTTClientHelper } from '@venizia/ignis';

// Via helpers directly
import { BullMQHelper, QueueHelper, MQTTClientHelper } from '@venizia/ignis-helpers';

// Types
import type { TBullQueueRole, TQueueStatus, TQueueElement } from '@venizia/ignis-helpers';
```
:::
