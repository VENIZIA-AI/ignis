import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Multi-Path Cases - several JSON paths, or a JSON path and a plain column, in one update
// ----------------------------------------------------------------
export class MultiPathCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 5: Multiple paths on same column
  // ----------------------------------------------------------------
  async case5UpdateByIdMultiplePathsSameColumn(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 5] Multiple paths: jValue.theme, jValue.fontSize');

    const code = `JSON_UPDATE_MULTI_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: { theme: 'light', fontSize: 12, language: 'en' },
        },
      });

      const id = created.data.id;

      // Update multiple paths on same column
      const updateResult = await repo.updateById({
        id,
        data: {
          'jValue.theme': 'dark',
          'jValue.fontSize': 16,
        } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;

        if (jValue?.theme === 'dark' && jValue?.fontSize === 16 && jValue?.language === 'en') {
          this.context.logger.info(
            '[CASE 5] PASSED | theme=dark, fontSize=16, language=en (preserved)',
          );
        } else {
          this.context.logger.error('[CASE 5] FAILED | jValue: %j', jValue);
        }
      } else {
        this.context.logger.error('[CASE 5] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: Multiple paths update (same column, different nested levels)
  // ----------------------------------------------------------------
  async case6UpdateByIdMultiplePaths(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 6] Multiple paths on different nested levels');

    const code = `JSON_UPDATE_MULTICOL_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: { theme: 'light', settings: { debug: false } },
        },
      });

      const id = created.data.id;

      // Update multiple paths
      const updateResult = await repo.updateById({
        id,
        data: {
          'jValue.theme': 'dark',
          'jValue.settings.debug': true,
          'jValue.newField': 'added',
        } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;

        if (
          jValue?.theme === 'dark' &&
          jValue?.settings?.debug === true &&
          jValue?.newField === 'added'
        ) {
          this.context.logger.info('[CASE 6] PASSED | All paths updated correctly');
        } else {
          this.context.logger.error('[CASE 6] FAILED | jValue: %j', jValue);
        }
      } else {
        this.context.logger.error('[CASE 6] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Mixed regular and JSON path fields
  // ----------------------------------------------------------------
  async case7UpdateByIdMixedRegularAndJsonPaths(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 7] Mixed: description + jValue.theme');

    const code = `JSON_UPDATE_MIXED_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          description: 'Original description',
          jValue: { theme: 'light', language: 'en' },
        },
      });

      const id = created.data.id;

      // Mix regular column update with JSON path
      const updateResult = await repo.updateById({
        id,
        data: {
          description: 'Updated description',
          'jValue.theme': 'dark',
        } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;

        if (
          verified?.description === 'Updated description' &&
          jValue?.theme === 'dark' &&
          jValue?.language === 'en'
        ) {
          this.context.logger.info(
            '[CASE 7] PASSED | description=Updated, theme=dark, language=en',
          );
        } else {
          this.context.logger.error(
            '[CASE 7] FAILED | description: %s, jValue: %j',
            verified?.description,
            jValue,
          );
        }
      } else {
        this.context.logger.error('[CASE 7] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }
}
