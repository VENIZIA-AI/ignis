---
title: Dynamic Binding Registration Fix
description: Datasources that a component registers during configure() are now configured.
packages: ['@venizia/ignis']
---

# Changelog - 2025-12-29

## Dynamic Binding Registration Fix

**In one line.** A datasource registered by a component during its `configure()` phase is now configured instead of being skipped.

## What changed

- **Datasources added by components work.** The application runs `registerDataSources()` again after `registerComponents()`, so a datasource added by a component gets its own `configure()` call. Other dynamic registrations (a component registering another component, a controller registering a datasource) are not covered yet.

## Who is affected

- **Components that register datasources in `configure()`.** They now work; no action needed.
- **Everyone else.** No action needed, and there are no breaking changes.
