---
title: [Short Title]
description: [Brief description of the changes]
---

# Changelog - YYYY-MM-DD

## [Main Title/Focus Area]

[A brief, high-level summary of the changes in this release. What is the main focus?]

## Overview

- **[Change 1]**: Brief description
- **[Change 2]**: Brief description
- **[Change 3]**: Brief description

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. [Breaking Change Title]

**Before:**
```typescript
// Code that no longer works or is deprecated
```

**After:**
```typescript
// New pattern
```

## New Features

### [Feature Name]

**File:** `packages/core/src/path/to/file.ts`

**Problem:** [What problem does this solve?]

**Solution:** [How does it solve it?]

```typescript
// Example usage
```

**Benefits:**
- Benefit 1
- Benefit 2

## Security Fixes

### [Security Issue Title]

**Vulnerability:** [Describe the vulnerability]

**Fix:** [Describe the fix]

```typescript
// Before: vulnerable code behavior
// After: secure code behavior
```

## Performance Improvements

### [Performance Improvement Title]

**File:** `packages/core/src/path/to/file.ts`

**Problem:** [What was slow/inefficient?]

**Solution:** [How was it optimized?]

| Scenario | Improvement |
|----------|-------------|
| [Use case 1] | [Improvement metric] |
| [Use case 2] | [Improvement metric] |

## Files Changed

### Core Package (`packages/core`)

| File | Changes |
|------|---------|
| `src/base/models/base.ts` | [Description of changes] |
| `src/base/repositories/core/readable.ts` | [Description of changes] |

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/utils/index.ts` | [Description of changes] |

### Examples (`examples/vert`)

| File | Changes |
|------|---------|
| `src/models/entities/user.model.ts` | [Description of changes] |

## Migration Guide

> [!NOTE]
> Follow these steps if you're upgrading from a previous version.

### Step 1: [Action Name]

[Instructions]

```typescript
// Example of the change to apply
```

### Step 2: [Action Name]

[Instructions]

## No Breaking Changes

[Use this section instead of "Breaking Changes" and "Migration Guide" if there are no breaking changes]

All changes are internal optimizations. No API changes or migration required.
