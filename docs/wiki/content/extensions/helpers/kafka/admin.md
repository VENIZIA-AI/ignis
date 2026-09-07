---
title: Kafka Admin
description: KafkaAdminHelper - topic, group, offset, ACL, and quota management
difficulty: intermediate
---

# Admin

The `KafkaAdminHelper` wraps `@platformatic/kafka`'s `Admin` with health tracking, graceful shutdown, and broker event callbacks. Use `getAdmin()` to access the full Admin API directly.

```typescript
class KafkaAdminHelper extends BaseKafkaHelper<Admin>
```

> [!NOTE]
> `KafkaAdminHelper` has **no generic type parameters** - the Admin client does not deal with serialized messages.

## Helper API

| Method | Signature | Description |
|--------|-----------|-------------|
| `newInstance(opts)` | `static newInstance(opts): KafkaAdminHelper` | Factory method |
| `getAdmin()` | `(): Admin` | Access the underlying `Admin` |
| `isHealthy()` | `(): boolean` | `true` when broker connected |
| `isReady()` | `(): boolean` | Same as `isHealthy()` |
| `getHealthStatus()` | `(): TKafkaHealthStatus` | `'connected'` \| `'disconnected'` \| `'unknown'` |
| `getConnectedBrokerCount()` | `(): number` | Number of currently connected brokers |
| `close(opts?)` | `(opts?: { isForce?: boolean }): Promise<void>` | Close the admin connection (default: graceful) |

## IKafkaAdminOptions

```typescript
interface IKafkaAdminOptions extends IKafkaConnectionOptions {
  identifier?: string;       // Default: 'kafka-admin'
  shutdownTimeout?: number;  // Default: 30000ms
  onBrokerConnect?: TKafkaBrokerEventCallback;
  onBrokerDisconnect?: TKafkaBrokerEventCallback;
}
```

Plus the shared [Connection & Authentication](./producer#connection--authentication) options (`bootstrapBrokers`, `clientId`, `retries`, `sasl`, `tls`, ...), documented once on the Producer page.

## Basic Example

```typescript
import { KafkaAdminHelper } from '@venizia/ignis-helpers/kafka';

const helper = KafkaAdminHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-admin',
  onBrokerConnect: ({ broker }) => console.log(`Connected to ${broker.host}:${broker.port}`),
  onBrokerDisconnect: ({ broker }) => console.log(`Disconnected from ${broker.host}`),
});

const admin = helper.getAdmin();

// Create a topic
await admin.createTopics({ topics: ['orders'], partitions: 3, replicas: 2 });

// List all topics
const topics = await admin.listTopics();

// Health check
helper.isHealthy(); // true when connected

// Graceful close
await helper.close();

// Or force close
await helper.close({ isForce: true });
```

## Graceful Shutdown

`close()` uses the base `closeClient()`, wrapped in a graceful timeout. `closeClient()` calls `this.client.close()` directly. If the graceful close exceeds `shutdownTimeout` (default 30s), it automatically force-closes. After `close()`, `healthStatus` becomes `'disconnected'`.

```typescript
// Graceful (recommended)
await helper.close();

// Force
await helper.close({ isForce: true });
```

## API Reference (`@platformatic/kafka`)

After calling `helper.getAdmin()`, you have full access to the `Admin` class.

### Topic Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `createTopics(opts)` | `(opts: { topics: string[], partitions?: number, replicas?: number, configs?: Config[] }): Promise<CreatedTopic[]>` | Create topics |
| `deleteTopics(opts)` | `(opts: { topics: string[] }): Promise<void>` | Delete topics |
| `listTopics(opts?)` | `(opts?: { includeInternals?: boolean }): Promise<string[]>` | List all topics |
| `createPartitions(opts)` | `(opts: { topics: CreatePartitionsRequestTopic[], validateOnly?: boolean }): Promise<void>` | Add partitions to existing topics |
| `deleteRecords(opts)` | `(opts: { topics: { name, partitions: { partition, offset }[] }[] }): Promise<DeletedRecordsTopic[]>` | Delete records up to offset |

```typescript
// Create with custom configuration
await admin.createTopics({
  topics: ['orders'],
  partitions: 6,
  replicas: 3,
  configs: [
    { name: 'retention.ms', value: '604800000' },   // 7 days
    { name: 'cleanup.policy', value: 'compact' },
    { name: 'compression.type', value: 'zstd' },
  ],
});

// Add partitions (can only increase, never decrease)
await admin.createPartitions({
  topics: [{ name: 'orders', count: 12 }],
});

// Delete records before offset 1000 on partition 0
await admin.deleteRecords({
  topics: [{ name: 'orders', partitions: [{ partition: 0, offset: 1000n }] }],
});
```

### Consumer Group Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `listGroups(opts?)` | `(opts?: { states?: string[], types?: string[] }): Promise<Map<string, GroupBase>>` | List consumer groups |
| `describeGroups(opts)` | `(opts: { groups: string[] }): Promise<Map<string, Group>>` | Describe consumer groups (members, assignments) |
| `deleteGroups(opts)` | `(opts: { groups: string[] }): Promise<void>` | Delete consumer groups |
| `removeMembersFromConsumerGroup(opts)` | `(opts: { groupId, members? }): Promise<void>` | Remove specific members |

```typescript
// List all active groups
const groups = await admin.listGroups({ states: ['STABLE'] });

// Describe group members and partition assignments
const details = await admin.describeGroups({ groups: ['order-processing'] });
for (const [groupId, group] of details) {
  console.log(`Group: ${groupId}, State: ${group.state}`);
  for (const [memberId, member] of group.members) {
    console.log(`  Member: ${member.clientId} (${member.clientHost})`);
  }
}
```

### Offset Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `listOffsets(opts)` | `(opts): Promise<ListedOffsetsTopic[]>` | List partition offsets at timestamps |
| `listConsumerGroupOffsets(opts)` | `(opts: { groups }): Promise<ListConsumerGroupOffsetsGroup[]>` | List committed offsets for groups |
| `alterConsumerGroupOffsets(opts)` | `(opts: { groupId, topics }): Promise<void>` | Reset/alter committed offsets |
| `deleteConsumerGroupOffsets(opts)` | `(opts: { groupId, topics }): Promise<...>` | Delete committed offsets |

```typescript
// Reset consumer group offsets to earliest
await admin.alterConsumerGroupOffsets({
  groupId: 'order-processing',
  topics: [{
    name: 'orders',
    partitionOffsets: [
      { partition: 0, offset: 0n },
      { partition: 1, offset: 0n },
      { partition: 2, offset: 0n },
    ],
  }],
});
```

### Configuration Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `describeConfigs(opts)` | `(opts: { resources, includeSynonyms?, includeDocumentation? }): Promise<ConfigDescription[]>` | Describe broker/topic configurations |
| `alterConfigs(opts)` | `(opts: { resources, validateOnly? }): Promise<void>` | Replace topic/broker configs |
| `incrementalAlterConfigs(opts)` | `(opts: { resources, validateOnly? }): Promise<void>` | Incrementally modify configs |

### ACL Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `createAcls(opts)` | `(opts: { creations: Acl[] }): Promise<void>` | Create access control lists |
| `describeAcls(opts)` | `(opts: { filter: AclFilter }): Promise<DescribeAclsResponseResource[]>` | Describe ACLs |
| `deleteAcls(opts)` | `(opts: { filters: AclFilter[] }): Promise<Acl[]>` | Delete ACLs |

### Quota Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `describeClientQuotas(opts)` | `(opts): Promise<DescribeClientQuotasResponseEntry[]>` | Describe client quotas |
| `alterClientQuotas(opts)` | `(opts): Promise<AlterClientQuotasResponseEntries[]>` | Alter client quotas |

### Log Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `describeLogDirs(opts)` | `(opts: { topics }): Promise<BrokerLogDirDescription[]>` | Describe broker log directories |

## See also

- [Kafka Overview](./) - the four helpers, shared health/close API, and the compile-binary caveat
- [Producer](./producer) - the shared Connection & Authentication options
- [Consumer](./consumer) - `groupInstanceId`, rebalance behavior, and lag monitoring for the groups this page manages
- [Examples & Troubleshooting](./examples) - a full topic-setup script and IoC wiring

**Files:**

- [`packages/helpers/src/modules/queue/kafka/admin.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/admin.ts) - `KafkaAdminHelper`
- [`packages/helpers/src/modules/queue/kafka/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/base.ts) - `BaseKafkaHelper`, shared health tracking and shutdown
- [`packages/helpers/src/modules/queue/kafka/common/types/admin.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/common/types/admin.ts) - `IKafkaAdminOptions`
