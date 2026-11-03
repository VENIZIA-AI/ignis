---
title: Performance Optimizations
description: Simple repository find() queries are about 15-20 percent faster and the repository layer allocates less, with no API change.
packages: ['@venizia/ignis']
---

# Changelog - 2025-12-18

## Performance Optimizations

**In one line.** Repository queries run faster and use less memory; nothing in your code changes.

## What changed

- **Simple `find()` queries are about 15-20% faster.** A query with no relations and no field selection now goes through Drizzle's Core API instead of the Query API, automatically.
- **Filters reuse column metadata.** `FilterBuilder` caches the table columns per schema instead of reading them on every filter operation. The cache lets a schema be garbage collected when nothing refers to it.
- **Entities share one schema factory.** `BaseEntity` creates it once, on first use, instead of once per entity instance.
- **Fewer Promise wrappers.** Repository methods no longer wrap an existing promise in `new Promise()`, which saves microtask queue entries and gives cleaner stack traces.

## Who is affected

- **Everyone using repositories.** No action needed: these are internal optimizations, with no API change and no migration.
