---
title: Initial Architecture
description: Documentation of the original Ignis architecture before the Model-Repository-DataSource refactor
---

# Changelog - 2025-12-16

## Initial Architecture (Pre-Refactor)

This documents the original architecture of the Ignis framework before the Model-Repository-DataSource refactor. This version required manual schema registration and explicit constructor parameters.

## Overview

- **Model Definition**: Three separate declarations (table, relations, class) for each model.
- **DataSource Definition**: Required manual schema registration.
- **Repository Definition**: Required explicit constructor injection.

## Architecture Pattern

### Model Definition

Models were defined in three separate steps:

```typescript
// Step 1: Define table schema
const TABLE_NAME = 'Configuration';

export const configurationTable = pgTable(TABLE_NAME, {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  ...generateTzColumnDefs(),
  code: text('code').notNull(),
  group: text('group').notNull(),
});

// Step 2: Define relations separately
export const configurationRelations = createRelations({
  source: configurationTable,
  relations: [
    {
      name: 'creator',
      type: RelationTypes.ONE,
      schema: userTable,
      metadata: {
        fields: [configurationTable.createdBy],
        references: [userTable.id],
      },
    },
  ],
});

// Step 3: Create model class
@model({ type: 'entity', skipMigrate: false })
export class Configuration extends BaseEntity<typeof configurationTable> {
  static readonly TABLE_NAME = Configuration.name;

  constructor() {
    super({
      name: Configuration.TABLE_NAME,
      schema: configurationTable,
    });
  }
}
```

### DataSource Definition

DataSources required manual schema registration:

```typescript
@datasource({})
export class PostgresDataSource extends BaseDataSource<TNodePostgresConnector, IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: { /* connection config */ },

      // Manual schema registration - verbose and error-prone
      schema: Object.assign(
        {},
        {
          [User.TABLE_NAME]: userTable,
          [Configuration.TABLE_NAME]: configurationTable,
        },
        {
          userRelations: userRelations.relations,
          configurationRelations: configurationRelations.relations,
        },
      ),
    });
  }
}
```

### Repository Definition

Repositories required explicit constructor injection:

```typescript
@repository({})
export class ConfigurationRepository extends DefaultCRUDRepository<typeof configurationTable> {
  constructor(@inject({ key: 'datasources.PostgresDataSource' }) dataSource: IDataSource) {
    super({
      dataSource,
      entityClass: Configuration,
      relations: configurationRelations.definitions,
    });
  }
}
```

## Pain Points

- **Verbose Model Definition**: Three separate declarations (table, relations, class) for each model
- **Manual Schema Registration**: DataSource required explicit registration of every model and relation
- **Unclear Repository Role**: Repository just wrapped datasource without defining the model-datasource binding
- **Declaration Order Issues**: Had to declare table before relations, relations before class
- **No Auto-Discovery**: Adding a new model required updates in multiple places
- **Tight Coupling**: Changes to model structure required updates in datasource configuration

## File Structure

```
src/
├── models/
│   └── entities/
│       ├── user.model.ts          # Table + Relations + Class
│       └── configuration.model.ts # Table + Relations + Class
├── datasources/
│   └── postgres.datasource.ts     # Manual schema assembly
└── repositories/
    ├── user.repository.ts         # Explicit constructor injection
    └── configuration.repository.ts
```

## Dependencies

- `@venizia/ignis-helpers`: Core utilities and types
- `@venizia/ignis-inversion`: Dependency injection
- `drizzle-orm`: ORM layer
- `drizzle-zod`: Schema validation

## No Breaking Changes

This document describes the initial state of the architecture.