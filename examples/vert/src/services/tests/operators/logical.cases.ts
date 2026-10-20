import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Logical Cases - nested AND/OR composition and where-clause edge semantics
// ----------------------------------------------------------------
export class LogicalCases extends BaseTestCases {
  // ================================================================
  // SECTION 6: COMPLEX LOGICAL OPERATIONS
  // ================================================================

  async testNestedAndOr(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[NESTED] Nested AND/OR: { and: [{ nValue: 10 }, { or: [{ nValue: 20 }, { nValue: 30 }] }] }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            and: [{ nValue: 10 }, { or: [{ nValue: 20 }, { nValue: 30 }] }],
          },
        },
      });

      // This should return nothing because AND requires both conditions
      // nValue = 10 AND (nValue = 20 OR nValue = 30) is always false
      if (results.length === 0) {
        this.context.logger.info(
          '[NESTED] PASSED | Correctly returned 0 records for impossible condition',
        );
      } else {
        this.context.logger.error('[NESTED] FAILED | Expected 0 records | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[NESTED] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testDeeplyNestedLogic(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[DEEP-NESTED] Deeply nested: OR -> AND -> field conditions');

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            or: [
              { and: [{ nValue: { gt: 0 } }, { nValue: { lt: 15 } }] }, // 10
              { and: [{ nValue: { gt: 45 } }, { nValue: { lt: 100 } }] }, // 50
            ],
          },
        },
      });

      // Should find nValue=10 (0<10<15) and nValue=50 (45<50<100)
      const values = results.map(r => r.nValue);
      if (results.length === 2 && values.includes(10) && values.includes(50)) {
        this.context.logger.info('[DEEP-NESTED] PASSED | Found records with nValue 10 and 50');
      } else {
        this.context.logger.error('[DEEP-NESTED] FAILED | Expected [10, 50] | Got: %j', values);
      }
    } catch (error) {
      this.context.logger.error('[DEEP-NESTED] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testOrWithMultipleConditions(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[OR-MULTI] OR with multiple conditions: { or: [{nValue: 10}, {nValue: 30}, {nValue: 50}] }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            or: [{ nValue: 10 }, { nValue: 30 }, { nValue: 50 }],
          },
        },
      });

      const expectedValues = [10, 30, 50];
      const actualValues = results.map(r => r.nValue);
      const allFound = expectedValues.every(v => actualValues.includes(v));

      if (allFound && results.length === 3) {
        this.context.logger.info('[OR-MULTI] PASSED | OR correctly matches all 3 values');
      } else {
        this.context.logger.error(
          '[OR-MULTI] FAILED | Expected [10,30,50] | Got: %j',
          actualValues,
        );
      }
    } catch (error) {
      this.context.logger.error('[OR-MULTI] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testAndWithOrInside(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[AND-OR] AND with OR inside: { tValue: { isn: null }, or: [{nValue: 10}, {nValue: 20}] }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            tValue: { isn: null }, // tValue IS NOT NULL
            or: [{ nValue: 10 }, { nValue: 20 }],
          },
        },
      });

      // Should find records where tValue is not null AND (nValue=10 OR nValue=20)
      const allValid = results.every(
        r => r.tValue !== null && (r.nValue === 10 || r.nValue === 20),
      );

      if (allValid && results.length === 2) {
        this.context.logger.info('[AND-OR] PASSED | AND with OR inside works correctly');
      } else {
        this.context.logger.error('[AND-OR] FAILED | Expected 2 records | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[AND-OR] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testEmptyWhereClause(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[EMPTY-WHERE] Empty where clause: { where: {} }');

    try {
      // First count all records
      await repo.find({ filter: {} });

      const results = await repo.find({
        filter: {
          where: {},
          limit: 100,
        },
      });

      // Empty where should return all records (up to limit)
      if (results.length > 0) {
        this.context.logger.info(
          '[EMPTY-WHERE] PASSED | Empty where returns all records | count: %d',
          results.length,
        );
      } else {
        this.context.logger.error('[EMPTY-WHERE] FAILED | Expected records | Got: 0');
      }
    } catch (error) {
      this.context.logger.error('[EMPTY-WHERE] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testUndefinedValueInWhere(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[UNDEFINED] Undefined value in where should be skipped');

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            nValue: undefined, // Should be skipped
          },
        },
      });

      // Should return all COMPREHENSIVE_TEST records (undefined is skipped)
      if (results.length >= 10) {
        this.context.logger.info(
          '[UNDEFINED] PASSED | undefined value skipped, returned %d records',
          results.length,
        );
      } else {
        this.context.logger.error(
          '[UNDEFINED] FAILED | Expected >= 10 records | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[UNDEFINED] FAILED | Error: %s', (error as Error).message);
    }
  }
}
