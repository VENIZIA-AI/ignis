# Setup Guide

Three-step setup: Bind configuration, Register component, Use in services. Keep code minimal.

## Structure

```markdown
## Setup Guide

### Step 1: Bind Configuration

` ``typescript
this.bind<IConfigType>({ key: Keys.CONFIG }).toValue({
  // minimal config here
});
` ``

### Step 2: Register Component

` ``typescript
this.component(ComponentClass);
` ``

### Step 3: Use in Services

` ``typescript
// Inject and use
` ``
```

## Rules

- Always three steps in this exact order
- **Step 1** shows the minimum viable configuration — only required fields
- **Step 2** is always a single `this.component()` call
- **Step 3** shows how downstream code interacts with what the component provides (routes, middleware, injected services)
- If Step 3 is "it just works" (e.g., Request Tracker auto-registers middleware), say so explicitly

## Example

From the Health Check component:

```typescript
// Step 1
this.bind<IHealthCheckConfig>({ key: HealthCheckKeys.CONFIG }).toValue({
  path: '/health',
});

// Step 2
this.component(HealthCheckComponent);

// Step 3 — Health check auto-registers GET /health endpoint. No injection needed.
```
