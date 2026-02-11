# Troubleshooting

### "Invalid cronTime to configure application cron!"

**Cause:** The `cronTime` option is empty or not provided.

**Fix:** Provide a valid cron pattern string:

```typescript
const job = new CronHelper({
  cronTime: '0 */1 * * * *', // Must be a non-empty cron pattern
  onTick: () => { /* ... */ },
});
```

### "Invalid cron instance to start cronjob!"

**Cause:** `start()` was called but the internal cron instance was not created, typically because `configure()` failed silently or the helper is in an unexpected state.

**Fix:** Ensure the constructor completed without errors before calling `start()`. Wrap creation in a try/catch to detect configuration failures:

```typescript
try {
  const job = new CronHelper({
    cronTime: '0 */1 * * * *',
    onTick: () => { /* ... */ },
  });
  job.start();
} catch (error) {
  console.error('Failed to create cron job:', error);
}
```

### Job does not fire at expected times

**Cause:** The `tz` option is not set or uses an incorrect timezone identifier, causing the job to fire based on the server's local timezone.

**Fix:** Set `tz` to the correct [IANA timezone identifier](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones):

```typescript
const job = new CronHelper({
  cronTime: '0 0 9 * * *', // 9 AM
  onTick: () => { /* ... */ },
  tz: 'America/New_York', // Explicit timezone
});
```
