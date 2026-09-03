import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Comparison Cases - eq, ne, gt, gte, lt, lte and same-field/range compositions
// ----------------------------------------------------------------
export class ComparisonCases extends BaseTestCases {
  // ================================================================
  // SECTION 1: COMPARISON OPERATORS
  // ================================================================

  async testEqOperatorExplicit(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[EQ] Explicit eq operator: { nValue: { eq: 20 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { eq: 20 } },
        },
      });

      if (results.length === 1 && results[0].nValue === 20) {
        this.context.logger.info('[EQ] PASSED | Found 1 record with nValue = 20');
      } else {
        this.context.logger.error('[EQ] FAILED | Expected 1 record | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[EQ] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testNeOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[NE] ne operator: { nValue: { ne: 20 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { ne: 20 } },
        },
      });

      // Should find all non-NULL records where nValue != 20
      const allNot20 = results.every(r => r.nValue !== 20);
      if (allNot20 && results.length > 0) {
        this.context.logger.info(
          '[NE] PASSED | Found %d records with nValue != 20',
          results.length,
        );
      } else {
        this.context.logger.error('[NE] FAILED | Some records have nValue = 20');
      }
    } catch (error) {
      this.context.logger.error('[NE] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testNeqOperatorAlias(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[NEQ] neq operator (alias for ne): { nValue: { neq: 30 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { neq: 30 } },
        },
      });

      const allNot30 = results.every(r => r.nValue !== 30);
      if (allNot30 && results.length > 0) {
        this.context.logger.info(
          '[NEQ] PASSED | Found %d records with nValue != 30',
          results.length,
        );
      } else {
        this.context.logger.error('[NEQ] FAILED | Some records have nValue = 30');
      }
    } catch (error) {
      this.context.logger.error('[NEQ] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testGtOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[GT] gt operator: { nValue: { gt: 30 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { gt: 30 } },
        },
      });

      // Should find records with nValue > 30: 40, 50, 100, 2147483647 = 4 records
      const allGreater = results.every(r => r.nValue !== null && r.nValue > 30);
      if (allGreater && results.length === 4) {
        this.context.logger.info('[GT] PASSED | Found %d records with nValue > 30', results.length);
        this.context.logger.info(
          '[GT] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.context.logger.error('[GT] FAILED | Expected 4 records | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[GT] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testGteOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[GTE] gte operator: { nValue: { gte: 30 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { gte: 30 } },
        },
      });

      // Should find records with nValue >= 30: 30, 40, 50, 100, 2147483647 = 5 records
      const allGte = results.every(r => r.nValue !== null && r.nValue >= 30);
      if (allGte && results.length === 5) {
        this.context.logger.info(
          '[GTE] PASSED | Found %d records with nValue >= 30',
          results.length,
        );
      } else {
        this.context.logger.error('[GTE] FAILED | Expected 5 records | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[GTE] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testLtOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[LT] lt operator: { nValue: { lt: 30 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { lt: 30 } },
        },
      });

      // Should find: -100, 0, 10, 20 = 4 records
      const allLess = results.every(r => r.nValue !== null && r.nValue < 30);
      if (allLess && results.length === 4) {
        this.context.logger.info('[LT] PASSED | Found %d records with nValue < 30', results.length);
        this.context.logger.info(
          '[LT] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.context.logger.error('[LT] FAILED | Expected 4 records | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[LT] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testLteOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[LTE] lte operator: { nValue: { lte: 30 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { lte: 30 } },
        },
      });

      // Should find: -100, 0, 10, 20, 30 = 5 records
      const allLte = results.every(r => r.nValue !== null && r.nValue <= 30);
      if (allLte && results.length === 5) {
        this.context.logger.info(
          '[LTE] PASSED | Found %d records with nValue <= 30',
          results.length,
        );
      } else {
        this.context.logger.error('[LTE] FAILED | Expected 5 records | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[LTE] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 5: MULTIPLE OPERATORS ON SAME FIELD
  // ================================================================

  async testMultipleOperatorsSameField(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[MULTI-OP] Multiple operators on same field: { nValue: { gt: 10, lt: 50 } }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { gt: 10, lt: 50 } },
        },
      });

      // Should find 20, 30, 40
      const allInRange = results.every(r => r.nValue !== null && r.nValue > 10 && r.nValue < 50);
      if (allInRange && results.length === 3) {
        this.context.logger.info('[MULTI-OP] PASSED | Found 3 records with 10 < nValue < 50');
        this.context.logger.info(
          '[MULTI-OP] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.context.logger.error(
          '[MULTI-OP] FAILED | Expected 3 records | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[MULTI-OP] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testRangeQueryGtAndLt(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[RANGE] Range query with gte and lte: { nValue: { gte: 20, lte: 40 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { gte: 20, lte: 40 } },
        },
      });

      // Same as between: 20, 30, 40
      const allInRange = results.every(r => r.nValue !== null && r.nValue >= 20 && r.nValue <= 40);
      if (allInRange && results.length === 3) {
        this.context.logger.info('[RANGE] PASSED | gte+lte works like between | Found 3 records');
      } else {
        this.context.logger.error('[RANGE] FAILED | Expected 3 records | Got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[RANGE] FAILED | Error: %s', (error as Error).message);
    }
  }
}
