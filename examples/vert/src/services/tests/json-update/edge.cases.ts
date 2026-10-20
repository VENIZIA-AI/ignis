import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Edge Cases - malformed column/type/path errors and SQL-injection handling
// ----------------------------------------------------------------
export class EdgeCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 12: Error - Non-existent column
  // ----------------------------------------------------------------
  async case12ErrorNonExistentColumn(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 12] Error: Non-existent column path');

    const code = `JSON_UPDATE_ERR_COL_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      try {
        await repo.updateById({
          id,
          data: { 'nonexistent.field': 'value' } as any,
        });
        this.context.logger.error('[CASE 12] FAILED | Should have thrown error');
      } catch (err: any) {
        if (err.message.includes('NOT FOUND') || err.message.includes('not found')) {
          this.context.logger.info('[CASE 12] PASSED | Error thrown for non-existent column');
        } else {
          this.context.logger.info(
            '[CASE 12] INFO | Different error: %s',
            err.message.substring(0, 80),
          );
        }
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 12] FAILED | Setup error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Error - Non-JSON column
  // ----------------------------------------------------------------
  async case13ErrorNonJsonColumn(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 13] Error: JSON path on non-JSON column');

    const code = `JSON_UPDATE_ERR_TYPE_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      try {
        // description is a text column, not JSON
        await repo.updateById({
          id,
          data: { 'description.nested': 'value' } as any,
        });
        this.context.logger.error('[CASE 13] FAILED | Should have thrown error');
      } catch (err: any) {
        if (err.message.toLowerCase().includes('json') || err.message.includes('not JSON')) {
          this.context.logger.info('[CASE 13] PASSED | Error thrown for non-JSON column');
        } else {
          this.context.logger.info(
            '[CASE 13] INFO | Different error: %s',
            err.message.substring(0, 80),
          );
        }
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 13] FAILED | Setup error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Error - Invalid path component
  // ----------------------------------------------------------------
  async case14ErrorInvalidPathComponent(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 14] Error: Invalid characters in path');

    const code = `JSON_UPDATE_ERR_PATH_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      const invalidPaths = [
        'jValue.invalid field', // space
        'jValue.field@domain', // special char
        'jValue.2startWithNum', // starts with number
        'jValue.field()', // parentheses
      ];

      let allRejected = true;

      for (const path of invalidPaths) {
        try {
          await repo.updateById({
            id,
            data: { [path]: 'value' } as any,
          });
          this.context.logger.error('[CASE 14] FAILED | Path should be rejected: %s', path);
          allRejected = false;
        } catch {
          // Expected to throw
        }
      }

      if (allRejected) {
        this.context.logger.info('[CASE 14] PASSED | All invalid paths rejected');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 14] FAILED | Setup error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: Security - SQL injection in path
  // ----------------------------------------------------------------
  async case15SecuritySqlInjectionInPath(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 15] Security: SQL injection in path rejected');

    const code = `JSON_UPDATE_SEC_PATH_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      const sqlInjectionPaths = [
        "jValue.'; DROP TABLE Configuration; --",
        "jValue.' OR '1'='1",
        'jValue.field; DELETE FROM Configuration;',
        'jValue.UNION SELECT * FROM passwords',
      ];

      let allRejected = true;

      for (const path of sqlInjectionPaths) {
        try {
          await repo.updateById({
            id,
            data: { [path]: 'value' } as any,
          });
          this.context.logger.error(
            '[CASE 15] FAILED | SQL injection should be rejected: %s',
            path.substring(0, 40),
          );
          allRejected = false;
        } catch {
          // Expected - SQL injection should be rejected
        }
      }

      if (allRejected) {
        this.context.logger.info('[CASE 15] PASSED | All SQL injection paths rejected');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 15] FAILED | Setup error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Security - SQL injection in value
  // ----------------------------------------------------------------
  async case16SecuritySqlInjectionInValue(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 16] Security: SQL injection in value safely stored');

    const code = `JSON_UPDATE_SEC_VAL_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      const sqlInjectionPayload = "'; DROP TABLE Configuration; --";

      // This should succeed - the value is stored as a string
      await repo.updateById({
        id,
        data: { 'jValue.userInput': sqlInjectionPayload } as any,
      });

      const verified = await repo.findById({ id });
      const jValue = verified?.jValue as Record<string, any>;

      if (jValue?.userInput === sqlInjectionPayload) {
        this.context.logger.info(
          '[CASE 16] PASSED | SQL injection payload safely stored as string',
        );
      } else {
        this.context.logger.error(
          '[CASE 16] FAILED | Value not stored correctly: %s',
          jValue?.userInput,
        );
      }

      // Verify no tables were dropped (Configuration table still works)
      const configStillExists = await repo.findById({ id });
      if (configStillExists) {
        this.context.logger.info('[CASE 16] PASSED | Database intact after injection attempt');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 16] FAILED | Error: %s', (error as Error).message);
    }
  }
}
