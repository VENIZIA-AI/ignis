---
title: Planned - Schema Migrator (Auto-Update)
description: Implementation plan for LoopBack 4-style auto schema migration without Drizzle Kit
---

# Planned: Schema Migrator (Auto-Update)

**Status:** Planned (Not Yet Implemented)
**Priority:** High

## Goal

Implement LoopBack 4-style automatic schema migration that reads model definitions from `@model` decorated classes and syncs them to the database. No external CLI tools (like Drizzle Kit) required.

Key principle: **Never drop tables or lose data** - only apply incremental changes (ADD/ALTER/DROP columns).

## Target API

```typescript
// In application boot
const migrator = dataSource.getMigrator();

// Auto-update: safe, only applies differences
await migrator.autoupdate();

// Or with options
await migrator.autoupdate({
  models: [User, Role], // Specific models only (optional)
  dryRun: true,         // Preview SQL without executing
});

// Fresh start (destructive - use with caution)
await migrator.automigrate(); // Drops and recreates all tables
```

### Migration Behaviors

| Method | Behavior | Data Loss |
|--------|----------|-----------|
| `autoupdate()` | Compares DB ↔ Model, applies ALTER statements | **No** |
| `automigrate()` | Drops and recreates tables | **Yes** |

---

## Implementation Steps

### Step 1: Define Migrator Types

**File:** `packages/core/src/base/datasources/common/types.ts`

```typescript
/** Column information from database introspection */
export interface IColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  character_maximum_length: number | null;
}

/** Constraint information from database */
export interface IConstraintInfo {
  constraint_name: string;
  constraint_type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK';
  column_name: string;
  foreign_table_name?: string;
  foreign_column_name?: string;
}

/** Index information from database */
export interface IIndexInfo {
  index_name: string;
  column_name: string;
  is_unique: boolean;
}

/** Options for autoupdate */
export interface IAutoupdateOptions {
  /** Only migrate specific models (default: all registered models) */
  models?: Array<typeof BaseEntity>;
  /** Preview SQL without executing (default: false) */
  dryRun?: boolean;
  /** Log generated SQL statements (default: true) */
  verbose?: boolean;
}

/** Options for automigrate */
export interface IAutomigrateOptions extends IAutoupdateOptions {
  /** Skip confirmation for destructive operation (default: false) */
  force?: boolean;
}

/** Result of migration operation */
export interface IMigrationResult {
  /** Tables created */
  created: string[];
  /** Tables altered */
  altered: string[];
  /** SQL statements executed (or would be executed if dryRun) */
  statements: string[];
  /** Errors encountered */
  errors: Array<{ table: string; error: string }>;
}
```

### Step 2: Create Schema Introspector

**File:** `packages/core/src/base/datasources/introspector.ts`

```typescript
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Introspects PostgreSQL database schema using information_schema
 */
export class SchemaIntrospector {
  constructor(private db: NodePgDatabase) {}

  /** Check if table exists */
  async tableExists(tableName: string): Promise<boolean>;

  /** Get all columns for a table */
  async getColumns(tableName: string): Promise<Map<string, IColumnInfo>>;

  /** Get all constraints for a table */
  async getConstraints(tableName: string): Promise<IConstraintInfo[]>;

  /** Get all indexes for a table */
  async getIndexes(tableName: string): Promise<IIndexInfo[]>;

  /** Get all table names in public schema */
  async getAllTables(): Promise<string[]>;
}
```

**Key Queries:**

```sql
-- Get columns
SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = $1;

-- Get constraints
SELECT tc.constraint_name, tc.constraint_type, kcu.column_name,
       ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public' AND tc.table_name = $1;

-- Get indexes
SELECT i.relname AS index_name, a.attname AS column_name, ix.indisunique AS is_unique
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = $1;
```

### Step 3: Create Schema Differ

**File:** `packages/core/src/base/datasources/differ.ts`

```typescript
import { getTableConfig, PgTable, PgColumn } from 'drizzle-orm/pg-core';

/** Types of schema changes */
export type TSchemaChange =
  | { type: 'CREATE_TABLE'; table: string; sql: string }
  | { type: 'ADD_COLUMN'; table: string; column: string; sql: string }
  | { type: 'DROP_COLUMN'; table: string; column: string; sql: string }
  | { type: 'ALTER_COLUMN_TYPE'; table: string; column: string; sql: string }
  | { type: 'ALTER_COLUMN_NULL'; table: string; column: string; sql: string }
  | { type: 'ADD_CONSTRAINT'; table: string; constraint: string; sql: string }
  | { type: 'DROP_CONSTRAINT'; table: string; constraint: string; sql: string }
  | { type: 'ADD_INDEX'; table: string; index: string; sql: string }
  | { type: 'DROP_INDEX'; table: string; index: string; sql: string };

/**
 * Compares model schema with database schema and generates changes
 */
export class SchemaDiffer {
  constructor(private introspector: SchemaIntrospector) {}

  /** Compare a single model with database and return changes */
  async diffTable(schema: PgTable): Promise<TSchemaChange[]>;

  /** Compare all models with database */
  async diffAll(schemas: PgTable[]): Promise<TSchemaChange[]>;
}
```

**Diff Logic:**

```typescript
async diffTable(schema: PgTable): Promise<TSchemaChange[]> {
  const config = getTableConfig(schema);
  const tableName = config.name;
  const changes: TSchemaChange[] = [];

  const tableExists = await this.introspector.tableExists(tableName);

  if (!tableExists) {
    // Generate CREATE TABLE
    changes.push({
      type: 'CREATE_TABLE',
      table: tableName,
      sql: this.generateCreateTable(config),
    });
    return changes;
  }

  // Table exists - compare columns
  const dbColumns = await this.introspector.getColumns(tableName);
  const modelColumns = new Map(Object.entries(config.columns));

  // Find columns to ADD
  for (const [colName, colDef] of modelColumns) {
    if (!dbColumns.has(colName)) {
      changes.push({
        type: 'ADD_COLUMN',
        table: tableName,
        column: colName,
        sql: `ALTER TABLE "${tableName}" ADD COLUMN ${this.columnToSQL(colName, colDef)}`,
      });
    }
  }

  // Find columns to DROP
  for (const [colName] of dbColumns) {
    if (!modelColumns.has(colName)) {
      changes.push({
        type: 'DROP_COLUMN',
        table: tableName,
        column: colName,
        sql: `ALTER TABLE "${tableName}" DROP COLUMN "${colName}"`,
      });
    }
  }

  // Find columns to ALTER
  for (const [colName, colDef] of modelColumns) {
    const dbCol = dbColumns.get(colName);
    if (dbCol) {
      changes.push(...this.diffColumn(tableName, colName, colDef, dbCol));
    }
  }

  // Diff constraints and indexes...
  return changes;
}
```

### Step 4: Create Type Mapper

**File:** `packages/core/src/base/datasources/type-mapper.ts`

```typescript
import { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Maps between Drizzle column types and PostgreSQL types
 */
export class TypeMapper {
  /** Convert Drizzle column to PostgreSQL type string */
  static drizzleToPostgres(column: PgColumn): string {
    const type = column.dataType;

    switch (type) {
      case 'string': return column.length ? `varchar(${column.length})` : 'text';
      case 'number': return 'integer';
      case 'bigint': return 'bigint';
      case 'boolean': return 'boolean';
      case 'date': return 'timestamp';
      case 'json': return 'jsonb';
      case 'uuid': return 'uuid';
      case 'custom': return column.sqlName; // For custom types
      default: return 'text';
    }
  }

  /** Check if two types are compatible (for ALTER TYPE) */
  static isCompatible(pgType: string, drizzleType: string): boolean;

  /** Generate USING clause for type conversion if needed */
  static getTypeConversion(from: string, to: string): string | null;
}
```

### Step 5: Create Schema Migrator

**File:** `packages/core/src/base/datasources/migrator.ts`

```typescript
import { MetadataRegistry } from '@/helpers/inversion';
import { SchemaIntrospector } from './introspector';
import { SchemaDiffer } from './differ';

/**
 * LoopBack 4-style schema migrator
 * Syncs model definitions to database without external CLI tools
 */
export class SchemaMigrator {
  private introspector: SchemaIntrospector;
  private differ: SchemaDiffer;

  constructor(private db: NodePgDatabase) {
    this.introspector = new SchemaIntrospector(db);
    this.differ = new SchemaDiffer(this.introspector);
  }

  /**
   * Auto-update schema - safe, incremental changes only
   * Like LoopBack 4's datasource.autoupdate()
   */
  async autoupdate(opts?: IAutoupdateOptions): Promise<IMigrationResult> {
    const schemas = this.getSchemas(opts?.models);
    const changes = await this.differ.diffAll(schemas);

    if (opts?.dryRun) {
      return this.buildResult(changes, { executed: false });
    }

    return this.executeChanges(changes, opts);
  }

  /**
   * Auto-migrate schema - destructive, drops and recreates
   * Like LoopBack 4's datasource.automigrate()
   */
  async automigrate(opts?: IAutomigrateOptions): Promise<IMigrationResult> {
    if (!opts?.force) {
      throw getError({
        message: '[automigrate] Destructive operation requires force: true',
      });
    }

    const schemas = this.getSchemas(opts?.models);

    // Drop tables in reverse order (for FK constraints)
    for (const schema of [...schemas].reverse()) {
      const tableName = getTableConfig(schema).name;
      await this.db.execute(sql.raw(`DROP TABLE IF EXISTS "${tableName}" CASCADE`));
    }

    // Create all tables fresh
    const changes = schemas.map(schema => ({
      type: 'CREATE_TABLE' as const,
      table: getTableConfig(schema).name,
      sql: this.generateCreateTable(schema),
    }));

    return this.executeChanges(changes, opts);
  }

  /** Get schemas from registry or specific models */
  private getSchemas(models?: Array<typeof BaseEntity>): PgTable[] {
    if (models) {
      return models.map(m => m.schema);
    }

    const registry = MetadataRegistry.getInstance();
    const allModels = registry.getAllModels();
    return [...allModels.values()].map(entry => entry.schema);
  }

  /** Execute schema changes */
  private async executeChanges(
    changes: TSchemaChange[],
    opts?: { verbose?: boolean }
  ): Promise<IMigrationResult>;
}
```

### Step 6: Integrate with DataSource

**File:** `packages/core/src/base/datasources/base.ts`

```typescript
export abstract class BaseDataSource<...> {
  private _migrator?: SchemaMigrator;

  /**
   * Get schema migrator instance
   * Like LoopBack 4's datasource property
   */
  getMigrator(): SchemaMigrator {
    if (!this._migrator) {
      this._migrator = new SchemaMigrator(this.connector);
    }
    return this._migrator;
  }

  /**
   * Convenience method: auto-update schema
   */
  async autoupdate(opts?: IAutoupdateOptions): Promise<IMigrationResult> {
    return this.getMigrator().autoupdate(opts);
  }

  /**
   * Convenience method: auto-migrate schema (destructive)
   */
  async automigrate(opts?: IAutomigrateOptions): Promise<IMigrationResult> {
    return this.getMigrator().automigrate(opts);
  }
}
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `packages/core/src/base/datasources/migrator.ts` | Main SchemaMigrator class |
| `packages/core/src/base/datasources/introspector.ts` | Database schema introspection |
| `packages/core/src/base/datasources/differ.ts` | Schema comparison logic |
| `packages/core/src/base/datasources/type-mapper.ts` | Drizzle ↔ PostgreSQL type mapping |

## Files to Modify

| File | Changes |
|------|---------|
| `packages/core/src/base/datasources/common/types.ts` | Add migration types and interfaces |
| `packages/core/src/base/datasources/base.ts` | Add `getMigrator()`, `autoupdate()`, `automigrate()` |
| `packages/core/src/base/datasources/index.ts` | Export new classes |

---

## Drizzle to PostgreSQL Type Mapping

| Drizzle | PostgreSQL | Notes |
|---------|------------|-------|
| `text()` | `text` | Variable-length string |
| `varchar({ length })` | `varchar(n)` | Fixed max length |
| `integer()` | `integer` | 32-bit signed |
| `bigint()` | `bigint` | 64-bit signed |
| `serial()` | `serial` | Auto-increment |
| `boolean()` | `boolean` | true/false |
| `timestamp()` | `timestamp` | Date and time |
| `date()` | `date` | Date only |
| `json()` | `json` | JSON storage |
| `jsonb()` | `jsonb` | Binary JSON (indexed) |
| `uuid()` | `uuid` | UUID type |
| `numeric({ precision, scale })` | `numeric(p,s)` | Exact decimal |
| `real()` | `real` | 32-bit float |
| `doublePrecision()` | `double precision` | 64-bit float |

---

## Change Detection Matrix

| Change Type | Detection Method | SQL Generated |
|-------------|------------------|---------------|
| New table | Table not in DB | `CREATE TABLE` |
| New column | Column not in DB | `ALTER TABLE ADD COLUMN` |
| Removed column | Column not in model | `ALTER TABLE DROP COLUMN` |
| Type change | Compare data_type | `ALTER TABLE ALTER COLUMN TYPE` |
| Nullability | Compare is_nullable | `SET NOT NULL` / `DROP NOT NULL` |
| Default change | Compare column_default | `SET DEFAULT` / `DROP DEFAULT` |
| New FK | Constraint not in DB | `ADD CONSTRAINT ... FOREIGN KEY` |
| Removed FK | Constraint not in model | `DROP CONSTRAINT` |
| New index | Index not in DB | `CREATE INDEX` |
| Removed index | Index not in model | `DROP INDEX` |

---

## Usage Examples

### Basic Auto-Update (Recommended)

```typescript
// Boot application
const app = new MyApplication();
await app.boot();

// Auto-update all models
const dataSource = app.getSync<PostgresDataSource>('datasources.PostgresDataSource');
const result = await dataSource.autoupdate();

console.log('Created tables:', result.created);
console.log('Altered tables:', result.altered);
console.log('SQL executed:', result.statements);
```

### Dry Run (Preview Changes)

```typescript
const result = await dataSource.autoupdate({ dryRun: true });

console.log('Would execute:');
for (const sql of result.statements) {
  console.log(sql);
}
```

### Migrate Specific Models

```typescript
import { User, Role } from './models';

await dataSource.autoupdate({
  models: [User, Role],
});
```

### Fresh Database (Development Only)

```typescript
if (process.env.NODE_ENV === 'development') {
  await dataSource.automigrate({ force: true });
}
```

---

## Safety Considerations

### autoupdate() Guarantees

| Guarantee | Description |
|-----------|-------------|
| No table drops | Never drops tables, even if removed from models |
| No data loss | Column drops are explicit (column must be removed from model) |
| Transactional | Each ALTER runs in its own transaction |
| Idempotent | Safe to run multiple times |

### Dangerous Operations (Require Confirmation)

| Operation | Risk | Mitigation |
|-----------|------|------------|
| `DROP COLUMN` | Data loss | Logged with warning |
| `ALTER TYPE` | May fail if incompatible | Checks compatibility first |
| `automigrate()` | Drops all tables | Requires `force: true` |

---

## Future Enhancements

1. **Migration History Table** - Track applied migrations in `_ignis_migrations`
2. **Rollback Support** - Generate reverse migrations
3. **Data Migrations** - LoopBack 4-style numbered data seed files
4. **Multi-Schema Support** - Support for PostgreSQL schemas beyond `public`
5. **MySQL/SQLite Support** - Extend beyond PostgreSQL

---

## Comparison with Alternatives

| Feature | Ignis Migrator | Drizzle Kit | LoopBack 4 |
|---------|----------------|-------------|------------|
| CLI required | No | Yes | No |
| Auto-discovery | Yes (from @model) | No (manual schema file) | Yes |
| Incremental updates | Yes | Yes | Yes |
| Dry run | Yes | Yes | No |
| Type safety | Full | Full | Partial |
| Random file names | No | Yes | No |
| Bidirectional | Planned | No | No |
