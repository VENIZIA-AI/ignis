import { describe, test, expect, beforeEach } from 'bun:test';
import { pgTable, serial, varchar, boolean } from 'drizzle-orm/pg-core';

import { model, repository } from '@/base/metadata';
import { BasePostgresDataSource } from '@/connectors/postgres/datasources';
import { BasePostgresEntity } from '@/connectors/postgres/models';
import { DefaultCRUDRepository } from '@/connectors/postgres/repositories';
import { FilterBuilder } from '@/connectors/postgres/repositories/operators';
import { TFilter } from '@/base/repositories/common';

/**
 * Adversarial coverage for the merge path actually used at runtime: `FilterBuilder.mergeFilter`
 * (src/connectors/postgres/repositories/operators/filter.ts) and
 * `PostgresBaseRepository.applyDefaultFilter` (src/connectors/postgres/repositories/core/base.ts).
 * A user-controlled filter must never be able to widen or erase a `@model` `defaultFilter`
 * (e.g. soft-delete, tenant scoping) regardless of the shape of the value it carries.
 */

type AnyFilter = TFilter<any>;

const SQL_INJECTION_PAYLOADS = {
  dropTableInKey: "'; DROP TABLE users; --",
  orAttack: "' OR '1'='1",
  unionSelect: "' UNION SELECT * FROM passwords --",
  nullByte: 'test\x00DROP TABLE',
  blindInjection: "1' AND (SELECT COUNT(*) FROM users) > 0 --",
} as const;

const XSS_PAYLOADS = {
  scriptTag: '<script>alert("xss")</script>',
  svgOnload: '<svg onload=alert(1)>',
  javascriptProtocol: 'javascript:alert(1)',
} as const;

const COMMAND_INJECTION_PAYLOADS = {
  semicolon: '; rm -rf /',
  backtick: '`whoami`',
} as const;

const PATH_TRAVERSAL_PAYLOADS = {
  basic: '../../../etc/passwd',
  nullByte: '../../../etc/passwd\x00.jpg',
} as const;

const NOSQL_INJECTION_PAYLOADS = {
  neOperator: { $ne: 1 },
  whereOperator: { $where: 'this.password == this.password' },
} as const;

const UNICODE_EDGE_CASES = {
  nullChar: 'test\u0000value',
  bom: '\uFEFFtest',
  zeroWidth: 'test\u200Bvalue',
  rightToLeft: '\u202Etest',
} as const;

const REDOS_PAYLOADS = {
  exponentialBacktrack: `${'a'.repeat(50)}!`,
  catastrophicBacktrack: `${'x'.repeat(100)}y`,
} as const;

describe('FilterBuilder.mergeFilter - adversarial input handling', () => {
  let filterBuilder: FilterBuilder;

  beforeEach(() => {
    filterBuilder = new FilterBuilder();
  });

  test('SQL injection payloads pass through as opaque values while the default where survives', () => {
    const defaultFilter: AnyFilter = { where: { isDeleted: false } };

    for (const [name, payload] of Object.entries(SQL_INJECTION_PAYLOADS)) {
      const userFilter: AnyFilter = { where: { [name]: payload } };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.isDeleted).toBe(false);
      expect(result.where?.[name]).toBe(payload);
    }
  });

  test('SQL injection payload placed in the where KEY does not execute or get stripped', () => {
    const defaultFilter: AnyFilter = { where: { isDeleted: false } };
    const userFilter: AnyFilter = {
      where: { [SQL_INJECTION_PAYLOADS.dropTableInKey]: 'value' },
    };
    const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

    expect(result.where?.isDeleted).toBe(false);
    expect(result.where?.[SQL_INJECTION_PAYLOADS.dropTableInKey]).toBe('value');
  });

  test('SQL injection in the order clause is passed through unsanitized (order is not a merge target)', () => {
    const defaultFilter = { order: ['createdAt DESC'] };
    const userFilter = { order: ['name; DROP TABLE users; --'] };
    const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

    expect(result.order).toEqual(['name; DROP TABLE users; --']);
  });

  test('XSS payloads pass through as opaque values while the default where survives', () => {
    const defaultFilter: AnyFilter = { where: { isDeleted: false } };

    for (const [name, payload] of Object.entries(XSS_PAYLOADS)) {
      const userFilter: AnyFilter = { where: { [name]: payload } };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.isDeleted).toBe(false);
      expect(result.where?.[name]).toBe(payload);
    }
  });

  test('command injection payloads pass through as opaque values while the default where survives', () => {
    const defaultFilter: AnyFilter = { where: { isDeleted: false } };

    for (const [name, payload] of Object.entries(COMMAND_INJECTION_PAYLOADS)) {
      const userFilter: AnyFilter = { where: { [name]: payload } };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.isDeleted).toBe(false);
      expect(result.where?.[name]).toBe(payload);
    }
  });

  test('path traversal payloads pass through as opaque values while the default where survives', () => {
    const defaultFilter: AnyFilter = { where: { isDeleted: false } };

    for (const [name, payload] of Object.entries(PATH_TRAVERSAL_PAYLOADS)) {
      const userFilter: AnyFilter = { where: { [name]: payload } };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.isDeleted).toBe(false);
      expect(result.where?.[name]).toBe(payload);
    }
  });

  describe('prototype pollution prevention', () => {
    test('__proto__ key in the user where does not pollute Object.prototype', () => {
      const defaultFilter: AnyFilter = { where: { isDeleted: false } };
      const userFilter: AnyFilter = {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        where: { __proto__: { polluted: true } },
      };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(result.where?.isDeleted).toBe(false);
    });

    test('nested __proto__ key does not pollute Object.prototype', () => {
      const defaultFilter: AnyFilter = { where: { safe: true } };
      const userFilter: AnyFilter = {
        where: {
          nested: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            __proto__: { hacked: true },
          },
        },
      };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(({} as Record<string, unknown>).hacked).toBeUndefined();
      expect(result.where?.safe).toBe(true);
    });

    test('constructor.prototype key in the user where does not pollute Object.prototype', () => {
      const defaultFilter: AnyFilter = { where: { isDeleted: false } };
      const userFilter: AnyFilter = {
        where: { constructor: { prototype: { polluted: true } } },
      };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(result.where?.isDeleted).toBe(false);
    });

    test('literal "__proto__.isAdmin" string key does not pollute Object.prototype', () => {
      const defaultFilter: AnyFilter = { where: {} };
      const userFilter: AnyFilter = {
        where: { '__proto__.isAdmin': true },
      };
      filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    });
  });

  test('NoSQL-style operator objects ($ne/$where) are merged as opaque data, not interpreted', () => {
    const defaultFilter: AnyFilter = { where: { isDeleted: false } };

    for (const [name, payload] of Object.entries(NOSQL_INJECTION_PAYLOADS)) {
      const userFilter: AnyFilter = { where: { [name]: payload } };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.isDeleted).toBe(false);
      expect(result.where?.[name]).toEqual(payload);
    }
  });

  test('Unicode edge cases (null char, BOM, zero-width, RTL override) pass through untouched', () => {
    const defaultFilter: AnyFilter = { where: { isDeleted: false } };

    for (const [name, value] of Object.entries(UNICODE_EDGE_CASES)) {
      const userFilter: AnyFilter = { where: { [name]: value } };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.isDeleted).toBe(false);
      expect(result.where?.[name]).toBe(value);
    }
  });

  test('ReDoS-shaped string payloads merge in well under a second (no regex evaluation on values)', () => {
    const defaultFilter: AnyFilter = { where: { isDeleted: false } };

    for (const payload of Object.values(REDOS_PAYLOADS)) {
      const userFilter: AnyFilter = { where: { pattern: payload } };

      const startedAt = Date.now();
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
      const elapsedMilliseconds = Date.now() - startedAt;

      expect(result.where?.pattern).toBe(payload);
      expect(elapsedMilliseconds).toBeLessThan(1000);
    }
  });

  describe('default filter bypass prevention', () => {
    test('user where: undefined does not erase the default where', () => {
      const defaultFilter = { where: { isDeleted: false } };
      const userFilter = { where: undefined };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where).toEqual({ isDeleted: false });
    });

    test('user where: null does not erase the default where', () => {
      const defaultFilter = { where: { isDeleted: false } };
      // @ts-expect-error where must be null (not a valid TWhere) to exercise the bypass guard.
      const userFilter: AnyFilter = { where: null };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where).toBeDefined();
    });

    test('empty user filter object preserves the default filter entirely', () => {
      const defaultFilter = { where: { isDeleted: false }, limit: 100 };
      const userFilter = {};
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where).toEqual({ isDeleted: false });
      expect(result.limit).toBe(100);
    });

    test('user where keys set to undefined do not override defined default values (soft-delete/tenant scope)', () => {
      const defaultFilter: AnyFilter = {
        where: { tenantId: 'safe-tenant', isDeleted: false },
      };
      const userFilter: AnyFilter = {
        where: { tenantId: undefined, isDeleted: undefined },
      };
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.tenantId).toBe('safe-tenant');
      expect(result.where?.isDeleted).toBe(false);
    });
  });

  test('special JavaScript object keys (hasOwnProperty/toString/valueOf) merge as ordinary where properties', () => {
    const defaultFilter: AnyFilter = { where: { isDeleted: false } };
    const userFilter: AnyFilter = {
      where: {
        hasOwnProperty: 'test',
        toString: 'string',
        valueOf: 'value',
      },
    };
    const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

    expect((result.where as Record<string, unknown>)?.['hasOwnProperty']).toBe('test');
    expect((result.where as Record<string, unknown>)?.['toString']).toBe('string');
    expect((result.where as Record<string, unknown>)?.['valueOf']).toBe('value');
    expect(result.where?.isDeleted).toBe(false);
  });

  test('a circular-reference where value never silently drops the default filter', () => {
    const circularObject: Record<string, unknown> = { name: 'test' };
    circularObject.self = circularObject;

    const defaultFilter: AnyFilter = { where: { isDeleted: false } };
    const userFilter: AnyFilter = { where: { data: circularObject } };

    try {
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
      expect(result.where?.isDeleted).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

class StubSecurityDataSource extends BasePostgresDataSource<object> {
  configure(): void {
    // no-op: never opens a real connection.
  }

  getConnectionString(): string {
    return '';
  }
}

const scopedFixtureTable = pgTable('security_fixture_scoped_entities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  isDeleted: boolean('is_deleted'),
});

/** Fixture entity carrying a real @model `defaultFilter` (soft-delete style), so
 * `PostgresBaseRepository.applyDefaultFilter` is exercised through its actual
 * `getDefaultFilter()`/`modelSettings` resolution path, not a mocked registry. */
@model({
  type: 'entity',
  settings: { defaultFilter: { where: { isDeleted: false }, limit: 100 } },
})
class ScopedFixtureEntity extends BasePostgresEntity {
  static override schema = scopedFixtureTable;
  static override TABLE_NAME = 'ScopedFixtureEntity';
}

@repository({ model: ScopedFixtureEntity, dataSource: StubSecurityDataSource })
class ScopedFixtureRepository extends DefaultCRUDRepository<typeof scopedFixtureTable> {}

const unscopedFixtureTable = pgTable('security_fixture_unscoped_entities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
});

/** Sibling fixture with no `defaultFilter` at all - the "nothing to bypass" control case. */
@model({ type: 'entity' })
class UnscopedFixtureEntity extends BasePostgresEntity {
  static override schema = unscopedFixtureTable;
  static override TABLE_NAME = 'UnscopedFixtureEntity';
}

@repository({ model: UnscopedFixtureEntity, dataSource: StubSecurityDataSource })
class UnscopedFixtureRepository extends DefaultCRUDRepository<typeof unscopedFixtureTable> {}

describe('PostgresBaseRepository.applyDefaultFilter (real production repository, not a mock)', () => {
  test('merges the @model default filter with an adversarial user filter', () => {
    const repo = new ScopedFixtureRepository(
      new StubSecurityDataSource({ name: 'security-scoped-ds', config: {} }),
    );

    const userFilter: AnyFilter = {
      where: { name: SQL_INJECTION_PAYLOADS.orAttack },
      limit: 10,
    };
    const result = repo.applyDefaultFilter({ userFilter });

    expect(result.where).toEqual({
      isDeleted: false,
      name: SQL_INJECTION_PAYLOADS.orAttack,
    });
    expect(result.limit).toBe(10);
  });

  test('shouldSkipDefaultFilter: true bypasses the default entirely, even with an adversarial user where', () => {
    const repo = new ScopedFixtureRepository(
      new StubSecurityDataSource({ name: 'security-scoped-skip-ds', config: {} }),
    );

    const userFilter: AnyFilter = { where: { isDeleted: true } };
    const result = repo.applyDefaultFilter({ userFilter, shouldSkipDefaultFilter: true });

    expect(result).toEqual({ where: { isDeleted: true } });
  });

  test('shouldSkipDefaultFilter: true with no user filter returns an empty object (no default leak)', () => {
    const repo = new ScopedFixtureRepository(
      new StubSecurityDataSource({ name: 'security-scoped-empty-ds', config: {} }),
    );

    const result = repo.applyDefaultFilter({ shouldSkipDefaultFilter: true });

    expect(result).toEqual({});
  });

  test('falls back to the @model default filter when no user filter is provided', () => {
    const repo = new ScopedFixtureRepository(
      new StubSecurityDataSource({ name: 'security-scoped-default-ds', config: {} }),
    );

    const result = repo.applyDefaultFilter({});

    expect(result).toEqual({ where: { isDeleted: false }, limit: 100 });
  });

  test('falls back to the user filter untouched when the repository has no default filter configured', () => {
    const repo = new UnscopedFixtureRepository(
      new StubSecurityDataSource({ name: 'security-unscoped-ds', config: {} }),
    );

    const userFilter: AnyFilter = { where: { name: XSS_PAYLOADS.scriptTag } };
    const result = repo.applyDefaultFilter({ userFilter });

    expect(result).toEqual({ where: { name: XSS_PAYLOADS.scriptTag } });
  });
});
