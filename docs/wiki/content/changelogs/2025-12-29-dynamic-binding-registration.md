---
title: Dynamic Binding Registration Fix
description: Fix components registering datasources/controllers during configure() phase
---

# Changelog - 2025-12-29

## Dynamic Binding Registration Fix

Components can now register datasources and controllers during their `configure()` phase, and those bindings will be properly configured.

## Overview

- **Simple Fix**: Re-run `registerDataSources()` after `registerComponents()`
- **Future Enhancement**: Multi-pass configuration loop for comprehensive dynamic registration

## Problem

When components register datasources during `configure()`, those datasources were never configured because `registerDataSources()` had already completed.

**Initialization Order (Before):**
1. `registerDataSources()` → configures initial datasources
2. `registerComponents()` → component registers NEW datasource (too late!)
3. `registerControllers()` → runs normally

The new datasource never gets its `configure()` called.

## Solution (Simple Fix)

**File:** `packages/core/src/base/applications/base.ts`

Call `registerDataSources()` again after `registerComponents()`:

```typescript
// Before:
await this.registerDataSources();
await this.registerComponents();
await this.registerControllers();

// After:
await this.registerDataSources();
await this.registerComponents();
await this.registerDataSources(); // Re-run for datasources added by components
await this.registerControllers();
```

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/applications/base.ts` | Added second `registerDataSources()` call after `registerComponents()` |

## No Breaking Changes

All changes are internal. Components that register datasources will now work correctly.

## Future Enhancement

For comprehensive dynamic registration support (components registering other components, controllers registering datasources, etc.), a multi-pass configuration loop can be implemented:

### Multi-Pass Configuration Loop (Future)

Instead of sequential registration, use a unified loop that continues until no new bindings are discovered:

```typescript
protected async runConfigurationLoop(): Promise<void> {
  const configured = {
    datasources: new Set<string>(),
    components: new Set<string>(),
    controllers: new Set<string>(),
  };

  let hasNewBindings = true;
  let iteration = 0;
  const MAX_ITERATIONS = 100;

  while (hasNewBindings && iteration < MAX_ITERATIONS) {
    iteration++;
    hasNewBindings = false;

    // Order: datasources -> components -> controllers
    const newDs = await this.configureNewBindings('datasources', configured.datasources);
    const newComp = await this.configureNewBindings('components', configured.components);
    const newCtrl = await this.configureNewBindings('controllers', configured.controllers);

    hasNewBindings = newDs || newComp || newCtrl;
  }
}
```

**Benefits of Multi-Pass:**
- Handles arbitrary nesting depth
- Components can register datasources, controllers, or other components
- Datasources configured before components that depend on them
- MAX_ITERATIONS prevents infinite loops from circular dependencies

**LoopBack 4 Insights Applied:**
- Three-phase execution pattern (configure → discover → load)
- Observer ordering (datasources before components before controllers)
- Stabilization detection (loop until no new bindings)

See full implementation plan in architecture documentation.
