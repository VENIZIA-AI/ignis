# Troubleshooting

### Debug logs not appearing

**Symptom:** Calling `logger.debug()` produces no output even though code is executing.

**Cause:** Debug logging requires both `DEBUG=true` AND a matching `NODE_ENV`. If `NODE_ENV=production`, debug is suppressed regardless of the `DEBUG` flag.

**Fix:**
1. Verify `DEBUG=true` is set in your environment.
2. Verify `NODE_ENV` is set to a common development environment (`local`, `debug`, `development`, `test`, `staging`) or is unset.
3. If you use a custom environment name (e.g. `qa`), add it to `APP_ENV_EXTRA_LOG_ENVS=qa`.

```bash
DEBUG=true NODE_ENV=development bun run server:dev
```

### UDP transport not sending logs

**Symptom:** Logs appear in console and files but not in the UDP aggregator.

**Cause:** `DgramTransport.fromPartial()` silently returns `null` if any required option is missing (`label`, `host`, `port`, `levels`, or `socketOptions`). The transport is simply not registered.

**Fix:**
1. Ensure **all four** dgram env vars are set: `APP_ENV_LOGGER_DGRAM_HOST`, `APP_ENV_LOGGER_DGRAM_PORT`, `APP_ENV_LOGGER_DGRAM_LABEL`, and `APP_ENV_LOGGER_DGRAM_LEVELS`.
2. `APP_ENV_LOGGER_DGRAM_LEVELS` must contain at least one level (e.g. `error,warn,info`). An empty value results in no transport.
3. Verify the UDP aggregator is reachable from your host (firewall, port binding).

### Log label shows "APP" instead of application name

**Symptom:** Log output shows `[APP]` instead of your expected application label.

**Cause:** The default label comes from `Defaults.APPLICATION_NAME`, which reads `APP_ENV_APPLICATION_NAME`. If the env var is not set, it falls back to `'APP'`.

**Fix:** Set `APP_ENV_APPLICATION_NAME` in your environment:

```bash
APP_ENV_APPLICATION_NAME=my-service
```
