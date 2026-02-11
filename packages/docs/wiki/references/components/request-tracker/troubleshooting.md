# Troubleshooting

### "Invalid middleware to init request tracker | Please check again binding value"

**Cause:** The `RequestSpyMiddleware` binding could not be resolved from the DI container. This typically means the binding was removed or overwritten before the component's `binding()` phase executed.

**Fix:** Ensure no custom code unbinds or replaces the `middlewares.RequestSpyMiddleware` key. If you need to customize request logging, extend the component rather than removing the binding.

### "Malformed Body Payload"

**Cause:** The `RequestSpyMiddleware` attempted to parse the request body based on the `Content-Type` header, but the body content was malformed (e.g., invalid JSON with `application/json` content type).

**Fix:** Ensure clients send valid body content that matches the declared `Content-Type` header. This error returns HTTP 400 Bad Request.

### "Malformed Connection Info"

**Cause:** The middleware could not determine the client IP address from either the connection info or the `x-real-ip`/`x-forwarded-for` headers.

**Fix:** Ensure your reverse proxy (e.g., Nginx, Caddy) forwards at least one of these headers:
- `x-real-ip`
- `x-forwarded-for`

If running without a proxy, ensure the runtime provides connection info (Bun does this natively).
