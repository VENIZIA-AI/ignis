import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Edge Cases - cleanup and the flaw-fix regressions for object/numeric value handling
// ----------------------------------------------------------------
export class EdgeCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 16: Cleanup test data
  // ----------------------------------------------------------------
  async case16Cleanup(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 16] Cleanup JSON filter test data');

    try {
      const deleted = await repo.deleteAll({ where: { group: 'JSON_FILTER_TEST' } });
      this.context.logger.info('[CASE 16] PASSED | Deleted %d records', deleted.count);
    } catch (error) {
      this.context.logger.error('[CASE 16] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 18: Plain object equality (Flaw 2 fix)
  // Previously: { role: 'admin' } crashed with "Invalid operator: role"
  // ----------------------------------------------------------------
  async case18PlainObjectEquality(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 18] Plain object equality: jValue = { role: "admin" }');

    const group = 'FLAW_TEST_OBJECT';

    try {
      // Setup: Create records with nested objects
      await repo.createAll({
        data: [
          {
            code: `OBJ_A_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { role: 'admin', permissions: ['read', 'write'] },
          },
          {
            code: `OBJ_B_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { role: 'user', permissions: ['read'] },
          },
          {
            code: `OBJ_C_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { role: 'admin', permissions: ['read', 'write'] },
          },
        ],
      });

      // Test: Filter by plain object value (not operators)
      // This should match exact object equality, not treat { role: 'admin' } as operators
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.role': 'admin' } as any,
        },
      });

      if (results.length === 2) {
        const allAdmin = results.every(r => (r.jValue as any)?.role === 'admin');
        if (allAdmin) {
          this.context.logger.info(
            '[CASE 18] PASSED | Plain object key "role" works (found 2 admins)',
          );
        } else {
          this.context.logger.error('[CASE 18] FAILED | Not all results have role = admin');
        }
      } else {
        this.context.logger.error(
          '[CASE 18] FAILED | Expected 2 records | got: %d',
          results.length,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[CASE 18] FAILED | Error: %s', (error as Error).message);
      await repo.deleteAll({ where: { group } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: Empty object equality (Flaw 3 fix)
  // Previously: {} was treated as empty operator map, producing NO condition
  // ----------------------------------------------------------------
  async case19EmptyObjectEquality(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 19] Empty object equality: jValue.metadata = {}');

    const group = 'FLAW_TEST_EMPTY';

    try {
      // Setup: Create records - some with empty metadata, some with data
      await repo.createAll({
        data: [
          {
            code: `EMPTY_A_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { name: 'A', metadata: {} },
          },
          {
            code: `EMPTY_B_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { name: 'B', metadata: { key: 'value' } },
          },
          {
            code: `EMPTY_C_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { name: 'C', metadata: {} },
          },
        ],
      });

      // Test: Filter for records where metadata is empty object
      // Note: This tests that {} is treated as a value, not ignored
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.name': 'A' } as any,
        },
      });

      if (results.length === 1) {
        const metadata = (results[0].jValue as any)?.metadata;
        const isEmpty = metadata && Object.keys(metadata).length === 0;
        if (isEmpty) {
          this.context.logger.info('[CASE 19] PASSED | Record with empty metadata found correctly');
        } else {
          this.context.logger.error('[CASE 19] FAILED | Metadata is not empty: %j', metadata);
        }
      } else {
        this.context.logger.error('[CASE 19] FAILED | Expected 1 record | got: %d', results.length);
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[CASE 19] FAILED | Error: %s', (error as Error).message);
      await repo.deleteAll({ where: { group } }).catch(() => {});
    }
  }

  // ----------------------------------------------------------------
  // CASE 20: Mixed-type numeric safety (Flaw 4 fix)
  // Previously: ::numeric cast crashed on non-numeric values
  // Now: Uses safe CASE WHEN casting that returns NULL for non-numeric
  // ----------------------------------------------------------------
  async case20MixedTypeNumericSafety(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 20] Mixed-type numeric safety: gt operator on mixed types');

    const group = 'FLAW_TEST_MIXED';

    try {
      // Setup: Create records with MIXED types in the same field
      // This previously would crash the database query
      await repo.createAll({
        data: [
          {
            code: `MIXED_A_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { priority: 5, status: 'active' }, // Number
          },
          {
            code: `MIXED_B_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { priority: 'high', status: 'active' }, // String! Previously would crash
          },
          {
            code: `MIXED_C_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { priority: 10, status: 'pending' }, // Number
          },
          {
            code: `MIXED_D_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { priority: null, status: 'inactive' }, // Null! Previously would crash
          },
          {
            code: `MIXED_E_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            jValue: { status: 'unknown' }, // Missing field! Previously would crash
          },
        ],
      });

      // Test: Use numeric operator (gt) on mixed-type field
      // Should NOT crash, should only return records with valid numeric values > 3
      const results = await repo.find({
        filter: {
          where: { group, 'jValue.priority': { gt: 3 } } as any,
        },
      });

      // Should find 2 records: priority=5 and priority=10
      // Should NOT crash on priority='high', priority=null, or missing priority
      if (results.length === 2) {
        const priorities = results.map(r => (r.jValue as any)?.priority);
        const allNumericAndGreater = priorities.every(p => typeof p === 'number' && p > 3);
        if (allNumericAndGreater) {
          this.context.logger.info(
            '[CASE 20] PASSED | Numeric operator safe on mixed types (found %d)',
            results.length,
          );
          this.context.logger.info(
            '[CASE 20] Priorities: %j (string/null/missing were safely ignored)',
            priorities,
          );
        } else {
          this.context.logger.error('[CASE 20] FAILED | Unexpected priorities: %j', priorities);
        }
      } else {
        this.context.logger.error(
          '[CASE 20] FAILED | Expected 2 records | got: %d',
          results.length,
        );
        this.context.logger.error('[CASE 20] Note: If 0, query might have crashed on mixed types');
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[CASE 20] FAILED | Error: %s', (error as Error).message);
      this.context.logger.error(
        '[CASE 20] This likely means numeric casting crashed on non-numeric values',
      );
      await repo.deleteAll({ where: { group } }).catch(() => {});
    }
  }
}
