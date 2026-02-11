# Troubleshooting

### "Worker ID must be between 0 and 1023"

**Cause:** The `workerId` option passed to the constructor is negative or exceeds 1023 (10-bit maximum).

**Fix:** Ensure the worker ID is within the valid range (0-1023):

```typescript
// Wrong
new SnowflakeUidHelper({ workerId: 2000 });

// Correct
new SnowflakeUidHelper({ workerId: 1 });
```

### "Epoch must be a positive number"

**Cause:** The `epoch` option is zero or negative.

**Fix:** Provide a valid epoch as a positive bigint representing milliseconds since Unix epoch:

```typescript
// Wrong
new SnowflakeUidHelper({ epoch: BigInt(0) });

// Correct
new SnowflakeUidHelper({ epoch: BigInt(1735689600000) });
```

### "Epoch cannot be in the future"

**Cause:** The `epoch` option is set to a timestamp later than the current time. A future epoch would produce negative timestamp offsets in generated IDs.

**Fix:** Use a past date as the epoch. The default (`2025-01-01 00:00:00 UTC`) is recommended unless you have a specific reason to change it.

### "Clock moved backward by Xms. Refusing to generate ID."

**Cause:** The system clock moved backward by more than 100ms, typically caused by NTP time synchronization. Small drifts (up to 100ms) are handled by busy-waiting, but larger jumps are rejected to protect ID uniqueness.

**Fix:** Ensure your system clock is stable. If running in containers, verify the host clock is not being adjusted aggressively. There is no code-level workaround -- the error protects against duplicate IDs.

### "Invalid Base62 character: X"

**Cause:** `decodeBase62()` encountered a character outside the Base62 alphabet (`0-9`, `A-Z`, `a-z`).

**Fix:** Ensure the input string only contains valid Base62 characters:

```typescript
// Wrong
generator.decodeBase62("9du1sJ+O88");   // '+' is not Base62
generator.decodeBase62(" 9du1sJXO88");  // leading space

// Correct
generator.decodeBase62("9du1sJXO88");
```
