import { DataTypes, getUID } from '@venizia/ignis-helpers';
import type { ITestCaseContext } from '../base-test.cases';

// ----------------------------------------------------------------
// Operator Test Fixture - shared setup/cleanup for the comprehensive operator suite
// ----------------------------------------------------------------
export class OperatorTestFixture {
  constructor(private readonly context: ITestCaseContext) {}

  // ================================================================
  // SETUP
  // ================================================================
  async setupTestData(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[SETUP] Creating comprehensive test data');

    const group = 'COMPREHENSIVE_TEST';

    try {
      await repo.createAll({
        data: [
          // Basic numeric values for comparison operators
          {
            code: `COMP_NUM_1_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 10,
            tValue: 'alpha',
            description: 'First record',
            jValue: { priority: 1, status: 'active', metadata: { level: 1, tags: ['a', 'b'] } },
          },
          {
            code: `COMP_NUM_2_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 20,
            tValue: 'beta',
            description: 'Second record',
            jValue: { priority: 2, status: 'pending', metadata: { level: 2, tags: ['b', 'c'] } },
          },
          {
            code: `COMP_NUM_3_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 30,
            tValue: 'gamma',
            description: 'Third record',
            jValue: { priority: 3, status: 'active', metadata: { level: 3, tags: ['c', 'd'] } },
          },
          {
            code: `COMP_NUM_4_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 40,
            tValue: 'delta',
            description: 'Fourth record',
            jValue: { priority: 4, status: 'inactive', metadata: { level: 4, tags: [] } },
          },
          {
            code: `COMP_NUM_5_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 50,
            tValue: 'epsilon',
            description: 'Fifth record',
            jValue: { priority: 5, status: 'active', metadata: { level: 5, tags: ['e'] } },
          },
          // NULL values for null operator tests
          {
            code: `COMP_NULL_1_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: null,
            tValue: null,
            description: null,
            jValue: { priority: null, status: null, metadata: null },
          },
          {
            code: `COMP_NULL_2_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: null,
            tValue: 'has text',
            description: 'has description',
            jValue: { priority: 0, status: 'unknown', metadata: {} },
          },
          // Empty string for edge cases
          {
            code: `COMP_EMPTY_${getUID()}`,
            group,
            dataType: DataTypes.TEXT,
            nValue: 0,
            tValue: '',
            description: '',
            jValue: { priority: -1, status: '', metadata: { level: 0, tags: [] } },
          },
          // Special characters for security tests
          {
            code: `COMP_SPECIAL_${getUID()}`,
            group,
            dataType: DataTypes.TEXT,
            nValue: 100,
            tValue: "test'value",
            description: "O'Brien & <script>alert('xss')</script>",
            jValue: { name: "test'json", query: "'; DROP TABLE users; --" },
          },
          // Large/boundary numbers
          {
            code: `COMP_LARGE_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 2147483647,
            tValue: 'max int',
            description: 'Maximum integer value',
            jValue: { priority: 999999999, bigValue: 9007199254740991 },
          },
          // Negative numbers
          {
            code: `COMP_NEGATIVE_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: -100,
            tValue: 'negative',
            description: 'Negative value record',
            jValue: { priority: -5, balance: -1000.5 },
          },
        ],
      });

      this.context.logger.info('[SETUP] PASSED | Created 11 test records');
    } catch (error) {
      this.context.logger.error('[SETUP] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // CLEANUP
  // ================================================================
  async cleanupTestData(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CLEANUP] Cleaning up comprehensive test data');

    try {
      const deleted = await repo.deleteAll({ where: { group: 'COMPREHENSIVE_TEST' } });
      this.context.logger.info('[CLEANUP] PASSED | Deleted %d records', deleted.count);
    } catch (error) {
      this.context.logger.error('[CLEANUP] FAILED | Error: %s', (error as Error).message);
    }
  }
}
