# Creating an Instance

Each queue type has its own constructor. All extend `BaseHelper`, providing scoped logging.

```typescript
import { BullMQHelper, MQTTClientHelper, QueueHelper, RedisHelper } from '@venizia/ignis-helpers';

// BullMQ (Redis-backed)
const bullmq = new BullMQHelper({
  queueName: 'my-email-queue',
  identifier: 'email-worker',
  role: 'worker',
  redisConnection: redisHelper,
  onWorkerData: async (job) => { /* process job */ },
});

// MQTT (broker-backed)
const mqtt = new MQTTClientHelper({
  identifier: 'my-mqtt-client',
  url: 'mqtt://localhost:1883',
  options: { username: 'user', password: 'password' },
  onMessage: ({ topic, message }) => { /* handle message */ },
});

// In-Memory (generator-based)
const queue = new QueueHelper<string>({
  identifier: 'my-task-queue',
  onMessage: async ({ queueElement }) => { /* process element */ },
});
```
