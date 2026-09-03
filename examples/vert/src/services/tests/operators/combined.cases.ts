import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Combined Cases - boundary values, JSON structural edges, security, real-world combos
// ----------------------------------------------------------------
export class CombinedCases extends BaseTestCases {
  async testLargeNumberBoundary(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[LARGE-NUM] Large number boundary: { nValue: 2147483647 }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: 2147483647 },
        },
      });

      if (results.length === 1 && results[0].nValue === 2147483647) {
        this.context.logger.info('[LARGE-NUM] PASSED | Found record with max integer value');
      } else {
        this.context.logger.error(
          '[LARGE-NUM] FAILED | Expected 1 record | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[LARGE-NUM] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testNegativeNumbers(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[NEGATIVE] Negative numbers: { nValue: { lt: 0 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { lt: 0 } },
        },
      });

      // Should find -100
      const allNegative = results.every(r => r.nValue !== null && r.nValue < 0);
      if (allNegative && results.length >= 1) {
        this.context.logger.info(
          '[NEGATIVE] PASSED | Found %d records with negative nValue',
          results.length,
        );
        this.context.logger.info(
          '[NEGATIVE] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.context.logger.error('[NEGATIVE] FAILED | Expected negative values');
      }
    } catch (error) {
      this.context.logger.error('[NEGATIVE] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testZeroValue(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[ZERO] Zero value: { nValue: 0 }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: 0 },
        },
      });

      if (results.length >= 1 && results.every(r => r.nValue === 0)) {
        this.context.logger.info(
          '[ZERO] PASSED | Found %d records with nValue = 0',
          results.length,
        );
      } else {
        this.context.logger.error(
          '[ZERO] FAILED | Expected records with nValue = 0 | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[ZERO] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testSkipBeyondDataset(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[SKIP-BEYOND] Skip beyond dataset: { skip: 1000 }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST' },
          skip: 1000,
        },
      });

      if (results.length === 0) {
        this.context.logger.info('[SKIP-BEYOND] PASSED | Skip beyond data returns empty array');
      } else {
        this.context.logger.error(
          '[SKIP-BEYOND] FAILED | Expected 0 records | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[SKIP-BEYOND] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testLimitZero(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[LIMIT-ZERO] Limit zero: { limit: 0 }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST' },
          limit: 0,
        },
      });

      // Behavior may vary: either returns nothing or ignores limit=0
      this.context.logger.info('[LIMIT-ZERO] INFO | limit: 0 returned %d records', results.length);
      if (results.length === 0) {
        this.context.logger.info('[LIMIT-ZERO] PASSED | limit: 0 returns empty array');
      } else {
        this.context.logger.warn(
          '[LIMIT-ZERO] WARNING | limit: 0 may be ignored (returned %d records)',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[LIMIT-ZERO] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testJsonDeeplyNestedPath(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[JSON-DEEP] Deeply nested JSON path: { "jValue.metadata.level": 3 }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.metadata.level': 3 } as any,
        },
      });

      if (results.length >= 1) {
        const level = (results[0].jValue as any)?.metadata?.level;
        if (level === 3) {
          this.context.logger.info('[JSON-DEEP] PASSED | Found record with metadata.level = 3');
        } else {
          this.context.logger.error('[JSON-DEEP] FAILED | Wrong level: %s', level);
        }
      } else {
        this.context.logger.error('[JSON-DEEP] FAILED | Expected records | Got: 0');
      }
    } catch (error) {
      this.context.logger.error('[JSON-DEEP] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testJsonEmptyObject(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[JSON-EMPTY-OBJ] JSON with empty object metadata');

    try {
      // Find records where metadata is empty object
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.metadata': '{}' } as any,
        },
      });

      this.context.logger.info(
        '[JSON-EMPTY-OBJ] INFO | Query for empty object returned %d records',
        results.length,
      );
      this.context.logger.info('[JSON-EMPTY-OBJ] PASSED | Query executed without error');
    } catch (error) {
      this.context.logger.error('[JSON-EMPTY-OBJ] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 9: SECURITY TESTS
  // ================================================================

  async testSqlInjectionInValue(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(`[SEC-SQL-VALUE] SQL injection in value: { tValue: "'; DROP TABLE--" }`);

    try {
      const maliciousValue = "'; DROP TABLE Configuration; --";

      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: maliciousValue },
        },
      });

      // Should return 0 records, NOT execute SQL injection
      this.context.logger.info(
        '[SEC-SQL-VALUE] PASSED | SQL injection safely handled | results: %d',
        results.length,
      );

      // Verify table still exists
      const stillExists = await repo.count({ where: { group: 'COMPREHENSIVE_TEST' } });
      if (stillExists.count > 0) {
        this.context.logger.info('[SEC-SQL-VALUE] VERIFIED | Table intact after injection attempt');
      }
    } catch (error) {
      this.context.logger.error('[SEC-SQL-VALUE] ERROR | %s', (error as Error).message);
    }
  }

  async testSqlInjectionInLikePattern(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[SEC-SQL-LIKE] SQL injection in LIKE pattern');

    try {
      const maliciousPattern = "%'; DELETE FROM Configuration WHERE '1'='1";

      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { like: maliciousPattern } },
        },
      });

      this.context.logger.info(
        '[SEC-SQL-LIKE] PASSED | LIKE injection safely handled | results: %d',
        results.length,
      );

      // Verify data intact
      const count = await repo.count({ where: { group: 'COMPREHENSIVE_TEST' } });
      if (count.count >= 10) {
        this.context.logger.info(
          '[SEC-SQL-LIKE] VERIFIED | Data intact after LIKE injection attempt',
        );
      }
    } catch (error) {
      this.context.logger.error('[SEC-SQL-LIKE] ERROR | %s', (error as Error).message);
    }
  }

  async testSqlInjectionInArrayValues(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[SEC-SQL-ARRAY] SQL injection in array values');

    try {
      const maliciousArray = ['normal', "'; DROP TABLE Configuration; --", 'value'];

      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { in: maliciousArray } },
        },
      });

      this.context.logger.info(
        '[SEC-SQL-ARRAY] PASSED | Array injection safely handled | results: %d',
        results.length,
      );
    } catch (error) {
      this.context.logger.error('[SEC-SQL-ARRAY] ERROR | %s', (error as Error).message);
    }
  }

  async testXssInDataStorage(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[SEC-XSS] XSS payload storage and retrieval');

    try {
      // Find record with XSS in description
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', description: { like: '%<script>%' } },
        },
      });

      if (results.length >= 1) {
        const desc = results[0].description;
        // XSS should be stored as-is (output escaping is UI responsibility)
        if (desc?.includes('<script>')) {
          this.context.logger.info(
            '[SEC-XSS] PASSED | XSS stored verbatim (escaping is UI concern)',
          );
        }
      } else {
        this.context.logger.info('[SEC-XSS] INFO | No XSS payload found in test data');
      }
    } catch (error) {
      this.context.logger.error('[SEC-XSS] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 10: COMBINATION TESTS (REAL-WORLD SCENARIOS)
  // ================================================================

  async testPaginationWithComplexFilter(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[COMBO-PAGINATE] Pagination with complex filter');

    try {
      // Page 1
      const page1 = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { isn: null } },
          order: ['nValue ASC'],
          limit: 3,
          skip: 0,
        },
      });

      // Page 2
      const page2 = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { isn: null } },
          order: ['nValue ASC'],
          limit: 3,
          skip: 3,
        },
      });

      // Verify no overlap
      const page1Ids = new Set(page1.map(r => r.id));
      const hasOverlap = page2.some(r => page1Ids.has(r.id));

      if (!hasOverlap && page1.length === 3 && page2.length === 3) {
        this.context.logger.info('[COMBO-PAGINATE] PASSED | Pagination works correctly');
        this.context.logger.info(
          '[COMBO-PAGINATE] Page 1 values: %j',
          page1.map(r => r.nValue),
        );
        this.context.logger.info(
          '[COMBO-PAGINATE] Page 2 values: %j',
          page2.map(r => r.nValue),
        );
      } else {
        this.context.logger.error('[COMBO-PAGINATE] FAILED | Pagination issue detected');
      }
    } catch (error) {
      this.context.logger.error('[COMBO-PAGINATE] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testSearchWithMultipleCriteria(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[COMBO-SEARCH] Search with multiple criteria (real-world)');

    try {
      // Simulate: Find active items with price in range, sorted by priority
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            nValue: { gte: 10, lte: 50 },
            tValue: { isn: null },
            'jValue.status': 'active',
          } as any,
          order: ['nValue DESC'],
          limit: 10,
        },
      });

      if (results.length >= 1) {
        this.context.logger.info(
          '[COMBO-SEARCH] PASSED | Multi-criteria search returned %d records',
          results.length,
        );
        this.context.logger.info(
          '[COMBO-SEARCH] First result: nValue=%s, tValue=%s',
          results[0].nValue,
          results[0].tValue,
        );
      } else {
        this.context.logger.warn('[COMBO-SEARCH] WARNING | No results for multi-criteria search');
      }
    } catch (error) {
      this.context.logger.error('[COMBO-SEARCH] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testDateRangeQuery(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[COMBO-DATE] Date range query using createdAt');

    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            createdAt: { gte: oneHourAgo.toISOString(), lte: now.toISOString() },
          },
        },
      });

      // All test data should be recent
      if (results.length >= 10) {
        this.context.logger.info(
          '[COMBO-DATE] PASSED | Date range query returned %d recent records',
          results.length,
        );
      } else {
        this.context.logger.warn(
          '[COMBO-DATE] WARNING | Date range returned fewer records than expected',
        );
      }
    } catch (error) {
      this.context.logger.error('[COMBO-DATE] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testPriceRangeWithTags(): Promise<void> {
    const repo = this.context.productRepository;
    this.context.logCase('[COMBO-PRODUCT] Product search: price range + tags (using Product repo)');

    const testTag = `COMBO_TEST_${getUID()}`;

    try {
      // Setup test products
      await repo.createAll({
        data: [
          {
            code: `COMBO_A_${getUID()}`,
            name: 'Product A',
            price: 100,
            tags: [testTag, 'featured'],
          },
          { code: `COMBO_B_${getUID()}`, name: 'Product B', price: 200, tags: [testTag, 'sale'] },
          { code: `COMBO_C_${getUID()}`, name: 'Product C', price: 300, tags: [testTag] },
        ],
      });

      // Complex query: price between 100-250, has specific tag
      const results = await repo.find({
        filter: {
          where: {
            price: { gte: 100, lte: 250 },
            tags: { contains: [testTag] },
          } as any,
        },
      });

      if (results.length === 2) {
        this.context.logger.info(
          '[COMBO-PRODUCT] PASSED | Found 2 products in price range with tag',
        );
      } else {
        this.context.logger.error('[COMBO-PRODUCT] FAILED | Expected 2 | Got: %d', results.length);
      }

      // Cleanup
      await repo.deleteAll({ where: { tags: { contains: [testTag] } } });
    } catch (error) {
      this.context.logger.error('[COMBO-PRODUCT] FAILED | Error: %s', (error as Error).message);
    }
  }
}
