import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Path Cases - simple, nested, non-existent and kebab-case JSON path resolution
// ----------------------------------------------------------------
export class PathCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 1: Setup test data with nested JSON
  // ----------------------------------------------------------------
  async case1SetupTestData(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 1] Setup test data with nested JSON');

    const group = 'JSON_FILTER_TEST';

    try {
      await repo.createAll({
        data: [
          {
            code: `JSON_FILTER_A_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: {
              priority: 1,
              name: 'Config A',
              metadata: { level: 'low', score: 45 },
              tags: ['normal', 'pending'],
            },
          },
          {
            code: `JSON_FILTER_B_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: {
              priority: 2,
              name: 'Config B',
              metadata: { level: 'medium', score: 70 },
              tags: ['review', 'active'],
            },
          },
          {
            code: `JSON_FILTER_C_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: {
              priority: 3,
              name: 'Config C',
              metadata: { level: 'high', score: 85 },
              tags: ['important', 'urgent'],
            },
          },
          {
            code: `JSON_FILTER_D_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: {
              priority: 4,
              name: 'Config D',
              metadata: { level: 'high', score: 95 },
              tags: ['critical', 'priority'],
            },
          },
          {
            code: `JSON_FILTER_E_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: {
              priority: 5,
              name: 'Config E',
              metadata: { level: 'critical', score: 100 },
              tags: ['emergency', 'immediate'],
            },
          },
        ],
      });

      this.context.logger.info(
        '[CASE 1] PASSED | Created 5 records with nested JSON for filter tests',
      );
    } catch (error) {
      this.context.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Filter by simple JSON field (eq)
  // ----------------------------------------------------------------
  async case2FilterBySimpleJsonField(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 2] Filter by jValue.priority = 3');

    const group = 'JSON_FILTER_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.priority': 3 } as any,
        },
      });

      if (results.length === 1 && (results[0].jValue as any)?.priority === 3) {
        this.context.logger.info('[CASE 2] PASSED | Found 1 record with priority = 3');
        this.context.logger.info('[CASE 2] Record name: %s', (results[0].jValue as any)?.name);
      } else {
        this.context.logger.error('[CASE 2] FAILED | Expected 1 record | got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Filter by nested JSON field (eq)
  // ----------------------------------------------------------------
  async case3FilterByNestedJsonField(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 3] Filter by jValue.metadata.level = "high"');

    const group = 'JSON_FILTER_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.metadata.level': 'high' } as any,
        },
      });

      if (results.length === 2) {
        const levels = results.map(r => (r.jValue as any)?.metadata?.level);
        const allHigh = levels.every(l => l === 'high');
        if (allHigh) {
          this.context.logger.info('[CASE 3] PASSED | Found 2 records with level = "high"');
          this.context.logger.info(
            '[CASE 3] Names: %j',
            results.map(r => (r.jValue as any)?.name),
          );
        } else {
          this.context.logger.error('[CASE 3] FAILED | Not all results have level = "high"');
        }
      } else {
        this.context.logger.error('[CASE 3] FAILED | Expected 2 records | got: %d', results.length);
      }
    } catch (error) {
      this.context.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: Non-existent JSON path
  // ----------------------------------------------------------------
  async case15NonExistentJsonPath(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 15] Filter by non-existent path: jValue.nonExistent = "value"');

    const group = 'JSON_FILTER_TEST';

    try {
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.nonExistent': 'value' } as any,
        },
      });

      if (results.length === 0) {
        this.context.logger.info(
          '[CASE 15] PASSED | Non-existent path returns 0 records (NULL comparison)',
        );
      } else {
        this.context.logger.error(
          '[CASE 15] FAILED | Expected 0 records | got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 15] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 17: Kebab-case JSON keys (Flaw 1 fix)
  // Previously: Regex /^[a-zA-Z_][a-zA-Z0-9_]*$/ blocked hyphens
  // ----------------------------------------------------------------
  async case17KebabCaseJsonKeys(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 17] Kebab-case JSON keys: jValue.user-id, jValue.api-key');

    const group = 'FLAW_TEST_KEBAB';

    try {
      // Setup: Create records with kebab-case keys
      await repo.createAll({
        data: [
          {
            code: `KEBAB_A_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { 'user-id': 'usr-001', 'api-key': 'key-abc', 'created-at': '2025-01-01' },
          },
          {
            code: `KEBAB_B_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { 'user-id': 'usr-002', 'api-key': 'key-xyz', 'created-at': '2025-01-02' },
          },
        ],
      });

      // Test: Filter by kebab-case key
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.user-id': 'usr-001' } as any,
        },
      });

      if (results.length === 1 && (results[0].jValue as any)?.['user-id'] === 'usr-001') {
        this.context.logger.info('[CASE 17] PASSED | Kebab-case key "user-id" works correctly');
      } else {
        this.context.logger.error('[CASE 17] FAILED | Expected 1 record with user-id = usr-001');
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[CASE 17] FAILED | Error: %s', (error as Error).message);
      await repo.deleteAll({ where: { group } }).catch(() => {});
    }
  }
}
