---
title: Kafka Schema Registry
description: KafkaSchemaRegistryHelper - schema-validated serialization for Avro, Protobuf, and JSON Schema
difficulty: intermediate
---

# Schema Registry

The `KafkaSchemaRegistryHelper` wraps `@platformatic/kafka`'s `ConfluentSchemaRegistry`. It provides a centralized schema registry that auto-serializes/deserializes messages using registered schemas (Avro, Protobuf, JSON Schema).

```typescript
class KafkaSchemaRegistryHelper<
  KeyType = string,
  ValueType = string,
  HeaderKeyType = string,
  HeaderValueType = string,
> extends BaseHelper
```

> [!NOTE]
> `KafkaSchemaRegistryHelper` extends `BaseHelper` directly (not `BaseKafkaHelper`) - it has no broker connection or health tracking. It's a configuration wrapper, not a client.

## Helper API

| Method | Signature | Description |
|--------|-----------|-------------|
| `newInstance(opts)` | `static newInstance<K,V,HK,HV>(opts): KafkaSchemaRegistryHelper<K,V,HK,HV>` | Factory method |
| `getRegistry()` | `(): ConfluentSchemaRegistry<K,V,HK,HV>` | Get the registry instance (pass to producer/consumer) |
| `getSerializers()` | `(): Serializers<K,V,HK,HV>` | Get schema-based serializers |
| `getDeserializers()` | `(): Deserializers<K,V,HK,HV>` | Get schema-based deserializers |

## IKafkaSchemaRegistryOptions

```typescript
interface IKafkaSchemaRegistryOptions extends ConfluentSchemaRegistryOptions {
  identifier?: string; // Default: 'kafka-schema-registry'
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | - | Schema registry URL. **Required** |
| `auth` | `{ username: string; password: string }` | - | Basic auth credentials |
| `protobufTypeMapper` | `ProtobufTypeMapper` | - | Custom Protobuf type mapper |
| `jsonValidateSend` | `boolean` | - | Validate JSON schema on produce |
| `identifier` | `string` | `'kafka-schema-registry'` | Scoped logging identifier |

## What it solves

Without a schema registry, producers and consumers must agree on message shape out-of-band. If the producer changes the shape of `value` (adds/removes fields), consumers break silently at runtime.

- **Schema Registry is a centralized server** (Confluent Schema Registry) that stores and validates schemas.
- **It enforces a contract on the way out.** The producer says "I want to send this shape." The registry validates that shape against the registered schema before the message reaches Kafka.
- **It enforces a contract on the way in.** The consumer asks "what shape is this?" The registry answers with how to deserialize it.

| | Without registry | With registry |
|---|---|---|
| **Message format** | Raw string, manual `JSON.stringify`/`JSON.parse` | Typed object, auto ser/deser |
| **Validation** | None - runtime crashes on shape drift | Schema validated before send |
| **Schema evolution** | Breaks consumers silently | Backward/forward compatibility enforced |
| **Where schemas live** | Nowhere (tribal knowledge) | Centralized server, e.g. `http://registry:8081` |

Use it when you need schema enforcement and compatibility checks across producers and consumers, especially in multi-team environments. Skip it for simple string or JSON messages where one team controls both sides - coordinate format changes by hand instead.

## Without vs. with the registry

Without a registry, serialization is entirely manual and unchecked:

```typescript
// Producer - manually serialize
const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'order-producer',
});

await producer.getProducer().send({
  messages: [{
    topic: 'orders',
    key: 'order-1',
    value: JSON.stringify({ id: 1, total: 99.99 }),  // <- plain string, no validation
  }],
});

// Consumer - manually deserialize, hope the shape is correct
const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'order-consumer',
  groupId: 'order-group',
  onMessage: async ({ message }) => {
    const order = JSON.parse(message.value as string);  // <- pray it matches
    console.log(order.id, order.total);
  },
});
```

If the producer adds `{ id: 1, total: 99.99, currency: 'USD' }` or removes `total`, the consumer has no way to know until it crashes.

With a registry, both sides pass `registry` instead of `serializers`/`deserializers`:

```typescript
import {
  KafkaSchemaRegistryHelper,
  KafkaProducerHelper,
  KafkaConsumerHelper,
} from '@venizia/ignis-helpers/kafka';

// 1. Create registry - points to Confluent Schema Registry server
const registry = KafkaSchemaRegistryHelper.newInstance({
  url: 'http://localhost:8081',
  // auth: { username: 'user', password: 'pass' },  // optional
});

// 2. Producer - pass registry, it auto-serializes values using the registered schema
const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'order-producer',
  registry: registry.getRegistry(),
});

await producer.getProducer().send({
  messages: [{
    topic: 'orders',
    key: 'order-1',
    value: { id: 1, total: 99.99 },  // <- object, not string! Registry serializes it
  }],
});
// If the value doesn't match the registered schema -> error BEFORE sending to Kafka

// 3. Consumer - pass the same registry, it auto-deserializes
const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'order-consumer',
  groupId: 'order-group',
  registry: registry.getRegistry(),
  onMessage: async ({ message }) => {
    // message.value is already a typed object, not a raw string
    console.log(message.value.id, message.value.total);
  },
});

await consumer.start({ topics: ['orders'] });
```

## With authentication

```typescript
const registry = KafkaSchemaRegistryHelper.newInstance({
  url: 'https://schema-registry.example.com',
  auth: {
    username: 'registry-user',
    password: 'registry-password',
  },
});
```

## Alternative: manual serializers

Instead of passing the full registry to `registry`, extract serializers/deserializers for manual use alongside `serializers`/`deserializers`:

```typescript
const registry = KafkaSchemaRegistryHelper.newInstance({
  url: 'http://localhost:8081',
});

// Use serializers directly (instead of registry)
const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-producer',
  serializers: registry.getSerializers(),
});

const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'my-consumer',
  groupId: 'my-group',
  deserializers: registry.getDeserializers(),
  onMessage: async ({ message }) => { /* ... */ },
});
```

## See also

- [Kafka Overview](./) - the four helpers, shared health/close API, and the compile-binary caveat
- [Producer](./producer) - `registry` as a producer option, plus the manual `serializers` alternative
- [Consumer](./consumer) - `registry` as a consumer option, plus the manual `deserializers` alternative
- [Examples & Troubleshooting](./examples) - IoC wiring and the common connection-error lookup table

**Files:**

- [`packages/helpers/src/modules/queue/kafka/schema/registry.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/schema/registry.ts) - `KafkaSchemaRegistryHelper`
- [`packages/helpers/src/modules/queue/kafka/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/queue/kafka/common/types.ts) - `IKafkaSchemaRegistryOptions`
