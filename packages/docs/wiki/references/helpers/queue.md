# Queue Helpers

Message queuing and asynchronous task management with BullMQ, MQTT, and in-memory solutions.

## Quick Reference

| Helper | Type | Use Case | Backed By |
|--------|------|----------|-----------|
| **BullMQHelper** | Redis-backed job queue | Background job processing, task queue | BullMQ + Redis |
| **MQTTClientHelper** | Message broker | Real-time messaging, IoT | MQTT broker |
| **QueueHelper** | In-memory queue | Sequential tasks, single process | Memory |

### BullMQHelper Roles

| Role | Purpose | Key Property |
|------|---------|--------------|
| `worker` | Process jobs (consumer) | `onWorkerData`, `onWorkerDataCompleted` |
| `queue` | Add jobs (producer) | `queue.add(name, data)` |

### Common Operations

| Helper | Subscribe/Consume | Publish/Produce |
|--------|-------------------|-----------------|
| **BullMQ** | Create worker role | `queue.add()` |
| **MQTT** | `subscribe({ topics })` | `publish({ topic, message })` |
| **In-Memory** | `new QueueHelper({ onMessage })` | `enqueue(payload)` |

## BullMQ Helper

The `BullMQHelper` provides a robust, Redis-backed message queuing system using the [BullMQ](https://docs.bullmq.io/) library. It's ideal for background job processing and can be configured to act as a job producer (queue) or a job consumer (worker).

### Creating a BullMQ Worker

To process jobs, you create a `BullMQHelper` with the `worker` role.

```typescript
import { BullMQHelper, RedisHelper } from '@venizia/ignis';

const redisConnection = new RedisHelper({
  name: 'redis-queue',
  host: 'localhost',
  port: 6379,
  password: 'password',
});

const myWorker = new BullMQHelper({
  queueName: 'my-email-queue',
  identifier: 'email-worker',
  role: 'worker',
  connection: redisConnection.getClient(),
  onWorkerData: async (job) => {
    console.log(`Sending email to ${job.data.email}`);
    // ... email sending logic
    return { status: 'ok' };
  },
  onWorkerDataCompleted: async (job, result) => {
    console.log(`Job ${job.id} completed with result:`, result);
  },
});
```

### Creating a BullMQ Queue (Producer)

To add jobs to the queue, you create a `BullMQHelper` with the `queue` role.

```typescript
import { BullMQHelper, RedisHelper } from '@venizia/ignis';

const redisConnection = new RedisHelper({
    name: 'redis-queue',
    host: 'localhost',
    port: 6379,
    password: 'password',
});

const myQueue = new BullMQHelper({
  queueName: 'my-email-queue',
  identifier: 'email-queue',
  role: 'queue',
  connection: redisConnection.getClient(),
});

// Add a job to the queue
myQueue.queue.add('send-welcome-email', { email: 'test@example.com' });
```

## MQTT Helper

The `MQTTClientHelper` provides an interface for interacting with an MQTT broker, allowing you to publish and subscribe to topics for real-time messaging.

```typescript
import { MQTTClientHelper } from '@venizia/ignis';

const mqttClient = new MQTTClientHelper({
  identifier: 'my-mqtt-client',
  url: 'mqtt://localhost:1883',
  options: {
    username: 'user',
    password: 'password',
  },
  onMessage: ({ topic, message }) => {
    console.log(`Received message on topic ${topic}:`, message.toString());
  },
});

// Subscribe to a topic
mqttClient.subscribe({ topics: ['my-topic'] });

// Publish a message
mqttClient.publish({ topic: 'my-topic', message: 'Hello, MQTT!' });
```

## In-Memory Queue Helper

The `QueueHelper` provides a simple, in-memory queue for managing sequential tasks within a single application instance. It's useful when you don't need the overhead of an external message broker.

```typescript
import { QueueHelper } from '@venizia/ignis';

const myQueue = new QueueHelper<string>({
  identifier: 'my-in-memory-queue',
  onMessage: async ({ queueElement }) => {
    console.log('Processing message:', queueElement.payload);
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 1000));
  },
});

myQueue.enqueue('message 1');
myQueue.enqueue('message 2');
```

## See Also

- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Background job processing

- **Other Helpers:**
  - [Helpers Index](./index) - All available helpers
  - [Cron Helper](./cron) - Scheduled tasks
  - [Redis Helper](./redis) - Redis pub/sub

- **References:**
  - [Mail Component](/references/components/mail) - Email queue integration

- **External Resources:**
  - [BullMQ Documentation](https://docs.bullmq.io/) - BullMQ queue library

- **Best Practices:**
  - [Performance Optimization](/best-practices/performance-optimization) - Queue optimization
