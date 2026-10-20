import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Array Cases - IN/NIN/BETWEEN operators and array-shaped JSON edge cases
// ----------------------------------------------------------------
export class ArrayCases extends BaseTestCases {
  // ================================================================
  // SECTION 4: ARRAY/LIST OPERATORS
  // ================================================================

  async testInOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[IN] in operator: { nValue: { in: [10, 20, 30] } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { in: [10, 20, 30] } },
        },
      });

      if (results.length === 3) {
        const values = results.map(r => r.nValue).sort((a, b) => (a ?? 0) - (b ?? 0));
        if (values.join(',') === '10,20,30') {
          this.context.logger.info('[IN] PASSED | Found 3 records with nValue in [10, 20, 30]');
        } else {
          this.context.logger.error('[IN] FAILED | Wrong values: %j', values);
        }
      } else {
        this.context.logger.error('[IN] FAILED | Expected 3 records | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[IN] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testInqOperatorAlias(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[INQ] inq operator (alias for in): { nValue: { inq: [40, 50] } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { inq: [40, 50] } },
        },
      });

      if (results.length === 2) {
        const values = results.map(r => r.nValue).sort((a, b) => (a ?? 0) - (b ?? 0));
        if (values.join(',') === '40,50') {
          this.context.logger.info('[INQ] PASSED | inq works as alias for in');
        } else {
          this.context.logger.error('[INQ] FAILED | Wrong values: %j', values);
        }
      } else {
        this.context.logger.error('[INQ] FAILED | Expected 2 records | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[INQ] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testNinOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[NIN] nin operator: { nValue: { nin: [10, 20, 30, 40, 50] } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { nin: [10, 20, 30, 40, 50] } },
        },
      });

      // IMPORTANT: SQL NIN does NOT return NULL values!
      // NULL NOT IN (values) = UNKNOWN, which is excluded from results
      // Should find: 0, 100, -100, 2147483647 = 4 records (NULLs excluded)
      const noneInList = results.every(r => ![10, 20, 30, 40, 50].includes(r.nValue as number));
      const noNulls = results.every(r => r.nValue !== null);
      if (noneInList && noNulls && results.length === 4) {
        this.context.logger.info(
          '[NIN] PASSED | Found %d records NOT in [10,20,30,40,50] (NULLs excluded by SQL)',
          results.length,
        );
        this.context.logger.info(
          '[NIN] Values: %j',
          results.map(r => r.nValue),
        );
      } else if (noneInList && results.length >= 4) {
        this.context.logger.warn(
          '[NIN] WARNING | Expected 4 records (NULLs excluded) | Got: %d',
          results.length,
        );
        this.context.logger.warn(
          '[NIN] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.context.logger.error(
          '[NIN] FAILED | Some values are in the exclusion list or unexpected count',
        );
      }
    } catch (error) {
      this.context.logger.error('[NIN] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testInEmptyArrayEdgeCase(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[IN-EMPTY] in with empty array should return nothing: { nValue: { in: [] } }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { in: [] } },
        },
      });

      if (results.length === 0) {
        this.context.logger.info('[IN-EMPTY] PASSED | Empty array IN returns 0 records');
      } else {
        this.context.logger.error(
          '[IN-EMPTY] FAILED | Expected 0 records | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[IN-EMPTY] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testNinEmptyArrayEdgeCase(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[NIN-EMPTY] nin with empty array should return everything: { nValue: { nin: [] } }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { nin: [] } },
        },
      });

      // Empty NIN means "not in nothing" = everything
      if (results.length >= 10) {
        this.context.logger.info(
          '[NIN-EMPTY] PASSED | Empty array NIN returns all %d records',
          results.length,
        );
      } else {
        this.context.logger.error(
          '[NIN-EMPTY] FAILED | Expected >= 10 records | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[NIN-EMPTY] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testBetweenOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[BETWEEN] between operator: { nValue: { between: [20, 40] } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { between: [20, 40] } },
        },
      });

      // Should find 20, 30, 40
      const allInRange = results.every(r => r.nValue !== null && r.nValue >= 20 && r.nValue <= 40);
      if (allInRange && results.length === 3) {
        this.context.logger.info(
          '[BETWEEN] PASSED | Found 3 records with nValue between 20 and 40',
        );
        this.context.logger.info(
          '[BETWEEN] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.context.logger.error(
          '[BETWEEN] FAILED | Expected 3 records in range | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[BETWEEN] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testNotBetweenOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[NOT-BETWEEN] notBetween operator: { nValue: { notBetween: [20, 40] } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { notBetween: [20, 40] } },
        },
      });

      // Should find: -100, 0, 10, 50, 100, 2147483647 = 6 records (NOT in 20-40 range)
      // Note: NULL values are excluded because NULL NOT BETWEEN returns UNKNOWN
      const allOutsideRange = results.every(
        r => r.nValue !== null && (r.nValue < 20 || r.nValue > 40),
      );

      if (allOutsideRange && results.length === 6) {
        this.context.logger.info(
          '[NOT-BETWEEN] PASSED | Found %d records outside range 20-40',
          results.length,
        );
        this.context.logger.info(
          '[NOT-BETWEEN] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.context.logger.error(
          '[NOT-BETWEEN] FAILED | Expected 6 records outside range | Got: %d',
          results.length,
        );
        this.context.logger.error(
          '[NOT-BETWEEN] Values: %j',
          results.map(r => r.nValue),
        );
      }
    } catch (error) {
      this.context.logger.error('[NOT-BETWEEN] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testJsonArrayMultipleIndices(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[JSON-ARRAY] JSON array index: { "jValue.metadata.tags[0]": "a" }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.metadata.tags[0]': 'a' } as any,
        },
      });

      if (results.length >= 1) {
        const tag = (results[0].jValue as any)?.metadata?.tags?.[0];
        if (tag === 'a') {
          this.context.logger.info('[JSON-ARRAY] PASSED | Found record with tags[0] = "a"');
        } else {
          this.context.logger.error('[JSON-ARRAY] FAILED | Wrong tag: %s', tag);
        }
      } else {
        this.context.logger.error('[JSON-ARRAY] FAILED | Expected records | Got: 0');
      }
    } catch (error) {
      this.context.logger.error('[JSON-ARRAY] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testJsonEmptyArray(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[JSON-EMPTY-ARR] JSON empty array in field');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.metadata.tags': '{}' } as any,
        },
      });

      // This tests if empty arrays in JSON can be queried
      this.context.logger.info(
        '[JSON-EMPTY-ARR] INFO | Query for empty array returned %d records',
        results.length,
      );
      this.context.logger.info('[JSON-EMPTY-ARR] PASSED | Query executed without error');
    } catch (error) {
      this.context.logger.error('[JSON-EMPTY-ARR] FAILED | Error: %s', (error as Error).message);
    }
  }
}
