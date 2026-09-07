import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Null and Boolean Cases - IS NULL / IS NOT NULL and null/boolean JSON values
// ----------------------------------------------------------------
export class NullAndBooleanCases extends BaseTestCases {
  // ================================================================
  // SECTION 2: NULL OPERATORS
  // ================================================================

  async testIsNullOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[IS] is operator for NULL: { nValue: { is: null } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { is: null } },
        },
      });

      // Should find 2 records with null nValue
      const allNull = results.every(r => r.nValue === null);
      if (allNull && results.length === 2) {
        this.context.logger.info(
          '[IS] PASSED | Found %d records with nValue IS NULL',
          results.length,
        );
      } else {
        this.context.logger.error(
          '[IS] FAILED | Expected 2 null records | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[IS] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testIsNotNullOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[ISN] isn operator for NOT NULL: { nValue: { isn: null } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { isn: null } },
        },
      });

      // Should find all non-null nValue records: 11 total - 2 null = 9 records
      const allNotNull = results.every(r => r.nValue !== null);
      if (allNotNull && results.length === 9) {
        this.context.logger.info(
          '[ISN] PASSED | Found %d records with nValue IS NOT NULL',
          results.length,
        );
      } else {
        this.context.logger.error(
          '[ISN] FAILED | Expected 9 non-null records | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[ISN] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testNullWithEqOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[EQ-NULL] eq with null should become IS NULL: { tValue: { eq: null } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { eq: null } },
        },
      });

      const allNull = results.every(r => r.tValue === null);
      if (allNull && results.length >= 1) {
        this.context.logger.info(
          '[EQ-NULL] PASSED | eq(null) correctly becomes IS NULL | count: %d',
          results.length,
        );
      } else {
        this.context.logger.error('[EQ-NULL] FAILED | eq(null) not working correctly');
      }
    } catch (error) {
      this.context.logger.error('[EQ-NULL] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testNullWithNeqOperator(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[NEQ-NULL] neq with null should become IS NOT NULL: { tValue: { neq: null } }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { neq: null } },
        },
      });

      // Should find all non-null tValue records: 11 total - 1 null = 10 records
      // (only COMP_NULL_1 has tValue = null)
      const allNotNull = results.every(r => r.tValue !== null);
      if (allNotNull && results.length === 10) {
        this.context.logger.info(
          '[NEQ-NULL] PASSED | neq(null) correctly becomes IS NOT NULL | count: %d',
          results.length,
        );
      } else {
        this.context.logger.error(
          '[NEQ-NULL] FAILED | Expected 10 records | got %d records',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[NEQ-NULL] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 8: JSON ADVANCED EDGE CASES
  // ================================================================

  async testJsonNullValue(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[JSON-NULL] JSON field with null value: { "jValue.priority": null }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.priority': null } as any,
        },
      });

      // Should find records where jValue.priority is null
      if (results.length >= 1) {
        this.context.logger.info(
          '[JSON-NULL] PASSED | Found %d records with null jValue.priority',
          results.length,
        );
      } else {
        this.context.logger.warn('[JSON-NULL] WARNING | No records with null JSON priority found');
      }
    } catch (error) {
      this.context.logger.error('[JSON-NULL] FAILED | Error: %s', (error as Error).message);
    }
  }

  async testJsonBooleanValue(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[JSON-BOOL] JSON boolean: Creating and querying boolean value');

    const code = `JSON_BOOL_${getUID()}`;

    try {
      // Create a record with boolean JSON value
      await repo.create({
        data: {
          code,
          group: 'COMPREHENSIVE_TEST',
          dataType: DataTypes.JSON,
          jValue: { active: true, verified: false },
        },
      });

      // Query for boolean true - Note: JSON #>> returns text, so we compare as string
      const results = await repo.find({
        filter: {
          where: { code, 'jValue.active': 'true' } as any,
        },
      });

      if (results.length === 1) {
        this.context.logger.info('[JSON-BOOL] PASSED | Found record with jValue.active = true');
      } else {
        this.context.logger.warn(
          '[JSON-BOOL] WARNING | Boolean comparison may need string: "true"',
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[JSON-BOOL] FAILED | Error: %s', (error as Error).message);
    }
  }
}
