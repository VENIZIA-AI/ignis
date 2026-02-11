# Troubleshooting

## "Invalid queue name"

**Cause:** The `queueName` option is empty or falsy when creating a BullMQ queue or worker.

**Fix:** Ensure you pass a non-empty `queueName`:

```typescript
// Wrong
new BullMQHelper({ queueName: '', role: 'queue', ... });

// Correct
new BullMQHelper({ queueName: 'my-email-queue', role: 'queue', ... });
```

## "Invalid client role to configure"

**Cause:** The `role` option is missing or not one of `'queue'` / `'worker'` when creating a BullMQ helper.

**Fix:** Ensure `role` is set to either `'queue'` or `'worker'`:

```typescript
// Wrong
new BullMQHelper({ role: undefined as any, ... });

// Correct
new BullMQHelper({ role: 'worker', ... });
```

## "Invalid url to configure mqtt client!"

**Cause:** The `url` option is empty when constructing an `MQTTClientHelper`. This throws an `ApplicationError` (status 500).

**Fix:** Pass a valid MQTT broker URL:

```typescript
// Wrong
new MQTTClientHelper({ url: '', ... });

// Correct
new MQTTClientHelper({ url: 'mqtt://localhost:1883', ... });
```

## "Elements not processing in In-Memory Queue"

**Cause:** Multiple possible reasons why `onMessage` is never called.

**Checklist:**
- Verify `onMessage` callback is provided -- the generator logs a warning and exits if missing
- Check if the queue is locked -- call `unlock({ shouldProcessNextElement: true })` to resume
- Check if `autoDispatch` is `false` -- call `nextMessage()` manually after each `enqueue()`
- Check if the queue is settled -- a settled queue rejects new elements; create a new `QueueHelper` instance
