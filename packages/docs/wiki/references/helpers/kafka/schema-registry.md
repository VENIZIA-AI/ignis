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
> `KafkaSchemaRegistryHelper` extends `BaseHelper` directly (not `BaseKafkaHelper`) — it has no broker connection or health tracking. It's a configuration wrapper, not a client.

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
| `url` | `string` | — | Schema registry URL. **Required** |
| `auth` | `{ username: string; password: string }` | — | Basic auth credentials |
| `protobufTypeMapper` | `ProtobufTypeMapper` | — | Custom Protobuf type mapper |
| `jsonValidateSend` | `boolean` | — | Validate JSON schema on produce |
| `identifier` | `string` | `'kafka-schema-registry'` | Scoped logging identifier |

## What Schema Registry Solves

Without a schema registry, producers and consumers must agree on message format out-of-band. If the producer changes the shape of `value` (adds/removes fields), consumers break silently at runtime.

**Schema Registry** is a centralized server (Confluent Schema Registry) that stores and validates schemas (Avro, Protobuf, JSON Schema). It enforces a contract:

```
Producer → "I want to send this shape" → Schema Registry validates → Kafka
Kafka → Consumer → "What shape is this?" → Schema Registry tells → Deserialize
```

### Without Schema Registry (raw strings)

```typescript
// Producer — manually serialize
const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'order-producer',
});

await producer.getProducer().send({
  messages: [{
    topic: 'orders',
    key: 'order-1',
    value: JSON.stringify({ id: 1, total: 99.99 }),  // ← just a string, no validation
  }],
});

// Consumer — manually deserialize, hope the shape is correct
const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'order-consumer',
  groupId: 'order-group',
  onMessage: async ({ message }) => {
    const order = JSON.parse(message.value as string);  // ← pray it matches
    console.log(order.id, order.total);
  },
});
```

Problem: if producer adds `{ id: 1, total: 99.99, currency: 'USD' }` or removes `total`, consumer has no way to know until it crashes.

### With Schema Registry (auto serialize/deserialize)

```typescript
// 1. Create registry — points to Confluent Schema Registry server
const registry = KafkaSchemaRegistryHelper.newInstance({
  url: 'http://localhost:8081',
  // auth: { username: 'user', password: 'pass' },  // optional
});

// 2. Producer — pass registry, it auto-serializes values using registered schema
const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'order-producer',
  registry: registry.getRegistry(),  // ← registry handles serialization
});

await producer.getProducer().send({
  messages: [{
    topic: 'orders',
    key: 'order-1',
    value: { id: 1, total: 99.99 },  // ← object, not string! Registry serializes it
  }],
});
// If the value doesn't match the registered schema → error BEFORE sending to Kafka

// 3. Consumer — pass same registry, it auto-deserializes
const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['127.0.0.1:29092'],
  clientId: 'order-consumer',
  groupId: 'order-group',
  registry: registry.getRegistry(),  // ← registry handles deserialization
  onMessage: async ({ message }) => {
    // message.value is already a typed object, not a raw string
    console.log(message.value.id, message.value.total);
  },
});
```

### Comparison

| | Without Registry | With Registry |
|---|---|---|
| **Message format** | Raw string, manual `JSON.stringify/parse` | Typed object, auto ser/deser |
| **Validation** | None — runtime crashes | Schema validated before send |
| **Schema evolution** | Break consumers silently | Backward/forward compatibility enforced |
| **Where schemas live** | Nowhere (tribal knowledge) | Centralized server `http://registry:8081` |

You only need it when you want **schema enforcement** across producers/consumers. For simple string messages, skip it entirely.

## Basic Usage

```typescript
import { KafkaSchemaRegistryHelper, KafkaProducerHelper, KafkaConsumerHelper } from '@venizia/ignis-helpers/kafka';

// 1. Create registry — points to Confluent Schema Registry server
const registry = KafkaSchemaRegistryHelper.newInstance({
  url: 'http://localhost:8081',
});

// 2. Producer — registry auto-serializes values using registered schema
const producer = KafkaProducerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
  clientId: 'order-producer',
  registry: registry.getRegistry(),
});

await producer.getProducer().send({
  messages: [{
    topic: 'orders',
    key: 'order-1',
    value: { id: 1, total: 99.99 },  // object, not string — registry serializes
  }],
});
// If value doesn't match the registered schema → error BEFORE sending to Kafka

// 3. Consumer — registry auto-deserializes
const consumer = KafkaConsumerHelper.newInstance({
  bootstrapBrokers: ['localhost:9092'],
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

## With Authentication

```typescript
const registry = KafkaSchemaRegistryHelper.newInstance({
  url: 'https://schema-registry.example.com',
  auth: {
    username: 'registry-user',
    password: 'registry-password',
  },
});
```

## Alternative: Manual Serializers

Instead of passing the full registry, you can extract serializers/deserializers for manual use:

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
  onMessage: async ({ message }) => { ... },
});
```

## When to Use

- **Use schema registry** when you need schema enforcement, validation, and compatibility checks across producers/consumers — especially in multi-team environments
- **Skip schema registry** for simple string/JSON messages where both sides are controlled by the same team and format changes are coordinated
