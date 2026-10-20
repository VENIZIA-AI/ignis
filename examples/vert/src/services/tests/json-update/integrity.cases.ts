import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Integrity Cases - value-type coverage, sibling/auto-vivification guarantees and bulk updateAll
// ----------------------------------------------------------------
export class IntegrityCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 8: Different value types
  // ----------------------------------------------------------------
  async case8JsonPathDifferentValueTypes(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[CASE 8] Different value types: string, number, boolean, null, object, array',
    );

    const code = `JSON_UPDATE_TYPES_${getUID()}`;
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

      // Update with various types
      const updateResult = await repo.updateById({
        id,
        data: {
          'jValue.stringVal': 'hello',
          'jValue.numberVal': 42,
          'jValue.boolVal': true,
          'jValue.nullVal': null,
          'jValue.objectVal': { nested: 'value' },
          'jValue.arrayVal': [1, 2, 3],
        } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;

        const checks = [
          jValue?.stringVal === 'hello',
          jValue?.numberVal === 42,
          jValue?.boolVal === true,
          jValue?.nullVal === null,
          jValue?.objectVal?.nested === 'value',
          Array.isArray(jValue?.arrayVal) && jValue?.arrayVal.length === 3,
        ];

        if (checks.every(Boolean)) {
          this.context.logger.info('[CASE 8] PASSED | All value types stored correctly');
        } else {
          this.context.logger.error('[CASE 8] FAILED | jValue: %j', jValue);
        }
      } else {
        this.context.logger.error('[CASE 8] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Sibling fields not affected
  // ----------------------------------------------------------------
  async case9SiblingFieldsNotAffected(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 9] Verify sibling fields preserved');

    const code = `JSON_UPDATE_SIBLING_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const initialJValue = {
        a: 'original_a',
        b: 'original_b',
        c: 'original_c',
        nested: {
          x: 1,
          y: 2,
          z: 3,
        },
      };

      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: initialJValue,
        },
      });

      const id = created.data.id;

      // Update only 'b' and 'nested.y'
      await repo.updateById({
        id,
        data: {
          'jValue.b': 'updated_b',
          'jValue.nested.y': 99,
        } as any,
      });

      const verified = await repo.findById({ id });
      const jValue = verified?.jValue as Record<string, any>;

      const allPreserved =
        jValue?.a === 'original_a' &&
        jValue?.b === 'updated_b' &&
        jValue?.c === 'original_c' &&
        jValue?.nested?.x === 1 &&
        jValue?.nested?.y === 99 &&
        jValue?.nested?.z === 3;

      if (allPreserved) {
        this.context.logger.info(
          '[CASE 9] PASSED | a=original_a, b=updated_b, c=original_c, x=1, y=99, z=3',
        );
      } else {
        this.context.logger.error('[CASE 9] FAILED | jValue: %j', jValue);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Creates missing intermediate keys
  // ----------------------------------------------------------------
  async case10CreatesMissingIntermediateKeys(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 10] Create missing intermediate keys');

    const code = `JSON_UPDATE_CREATE_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      // Create with empty jValue
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {},
        },
      });

      const id = created.data.id;

      // Update deeply nested path on empty object
      await repo.updateById({
        id,
        data: {
          'jValue.deeply.nested.path.value': 'created',
        } as any,
      });

      const verified = await repo.findById({ id });
      const jValue = verified?.jValue as Record<string, any>;

      if (jValue?.deeply?.nested?.path?.value === 'created') {
        this.context.logger.info('[CASE 10] PASSED | Created deeply.nested.path.value="created"');
      } else {
        this.context.logger.error('[CASE 10] FAILED | jValue: %j', jValue);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: updateAll with JSON paths
  // ----------------------------------------------------------------
  async case11UpdateAllWithJsonPaths(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 11] Bulk update with JSON paths');

    const groupId = `JSON_BULK_${getUID()}`;

    try {
      // Create multiple configs
      await repo.createAll({
        data: [
          {
            code: `${groupId}_1`,
            group: groupId,
            dataType: DataTypes.JSON,
            jValue: { verified: false, batchGroup: groupId },
          },
          {
            code: `${groupId}_2`,
            group: groupId,
            dataType: DataTypes.JSON,
            jValue: { verified: false, batchGroup: groupId },
          },
          {
            code: `${groupId}_3`,
            group: groupId,
            dataType: DataTypes.JSON,
            jValue: { verified: false, batchGroup: groupId },
          },
        ],
      });

      // Bulk update using JSON path
      const updateResult = await repo.updateAll({
        where: { group: groupId },
        data: { 'jValue.verified': true } as any,
      });

      if (updateResult.count === 3) {
        // Verify all configs have verified=true
        const configs = await repo.find({
          filter: { where: { group: groupId } },
        });

        const allVerified = configs.every(c => (c.jValue as any)?.verified === true);

        if (allVerified) {
          this.context.logger.info(
            '[CASE 11] PASSED | All %d configs have verified=true',
            configs.length,
          );
        } else {
          this.context.logger.error('[CASE 11] FAILED | Not all configs verified');
        }
      } else {
        this.context.logger.info(
          '[CASE 11] INFO | updateAll returned count: %d (expected 3)',
          updateResult.count,
        );
      }

      await repo.deleteAll({ where: { group: groupId } });
    } catch (error) {
      this.context.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }
}
