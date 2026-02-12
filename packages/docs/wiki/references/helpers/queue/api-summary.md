# API Summary

::: details BullMQ Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `static newInstance(opts)` | `BullMQHelper` | Factory method -- same as `new BullMQHelper(opts)` |
| `configureQueue()` | `void` | Set up the BullMQ `Queue` instance (called automatically for `queue` role) |
| `configureWorker()` | `void` | Set up the BullMQ `Worker` instance (called automatically for `worker` role) |
| `configure()` | `void` | Delegates to `configureQueue()` or `configureWorker()` based on `role` |
| `close()` | `Promise<void>` | Gracefully close the worker and/or queue |

:::

::: details MQTT Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `subscribe(opts)` | `Promise<string[]>` | Subscribe to one or more topics |
| `publish(opts)` | `Promise<{ topic, message }>` | Publish a message (`string` or `Buffer`) |
| `configure()` | `void` | Connect to the broker (called automatically by the constructor) |

:::

::: details Kafka Methods

**Consumer (`KafkaConsumerHelper`):**

| Method | Returns | Description |
|--------|---------|-------------|
| `connectConsumer()` | `Promise<void>` | Connect to the Kafka broker |
| `subscribeToTopics(topics)` | `Promise<void>` | Subscribe to one or more topics |
| `runConsumer()` | `Promise<void>` | Start the consumer loop (calls `onMessage` or `onBatch`) |
| `pauseConsumer(topics)` | `void` | Pause consumption for specific topics/partitions |
| `resumeConsumer(topics)` | `void` | Resume consumption for specific topics/partitions |
| `seek(topic, partition, offset)` | `void` | Seek to a specific offset |
| `commitOffsets(offsets)` | `Promise<void>` | Manually commit offsets |
| `disconnectConsumer()` | `Promise<void>` | Disconnect and close the consumer |

**Producer (`KafkaProducerHelper`):**

| Method | Returns | Description |
|--------|---------|-------------|
| `connectProducer()` | `Promise<void>` | Connect producer to the broker |
| `sendMessages(record)` | `Promise<RecordMetadata[]>` | Send messages to a topic |
| `sendBatch(batch)` | `Promise<RecordMetadata[]>` | Send a batch of messages to multiple topics |
| `disconnectProducer()` | `Promise<void>` | Disconnect the producer |

**Admin (`KafkaAdminHelper`):**

| Method | Returns | Description |
|--------|---------|-------------|
| `createTopics(opts)` | `Promise<boolean>` | Create new topics |
| `deleteTopics(opts)` | `Promise<void>` | Delete topics |
| `createPartitions(opts)` | `Promise<void>` | Increase partition count for topics |
| `listTopics()` | `Promise<string[]>` | List all topic names |
| `fetchTopicMetadata(opts)` | `Promise<ITopicMetadata[]>` | Get metadata for topics |
| `fetchTopicOffsets(topic)` | `Promise<Array>` | Get high/low watermarks for a topic |
| `listGroups()` | `Promise<Array>` | List all consumer groups |
| `describeGroups(groupIds)` | `Promise<GroupDescriptions>` | Get consumer group details |
| `resetOffsets(opts)` | `Promise<void>` | Reset consumer group offsets |

:::

::: details In-Memory Queue Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `enqueue(payload)` | `Promise<void>` | Add an element to the queue |
| `dequeue()` | `TQueueElement \| undefined` | Remove and return the first element |
| `nextMessage()` | `void` | Manually trigger processing (used when `autoDispatch: false`) |
| `lock()` | `void` | Pause processing -- state becomes `LOCKED` |
| `unlock(opts)` | `void` | Resume processing (default: processes next element) |
| `settle()` | `void` | Mark queue as settled -- no new elements accepted |
| `isSettled()` | `boolean` | Check if queue is settled and empty |
| `close()` | `void` | Settle the queue and terminate the generator |
| `getElementAt(position)` | `TQueueElement` | Peek at an element by index |
| `getState()` | `TQueueStatus` | Current queue state |
| `getTotalEvent()` | `number` | Total elements ever enqueued |
| `getProcessingEvents()` | `Set<TQueueElement>` | Currently processing elements |

:::
