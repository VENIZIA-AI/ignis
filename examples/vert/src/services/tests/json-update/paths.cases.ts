import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Paths Cases - baseline normal-column update plus simple, nested and array-index JSON paths
// ----------------------------------------------------------------
export class PathsCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 1: Baseline - updateById with normal columns only
  // ----------------------------------------------------------------
  async case1UpdateByIdNormalColumns(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 1] Baseline: Update normal columns');

    const code = `JSON_UPDATE_BASELINE_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.NUMBER,
          nValue: 100,
          description: 'Original description',
        },
      });

      const id = created.data.id;

      // Update normal columns only
      const updateResult = await repo.updateById({
        id,
        data: { nValue: 200, description: 'Updated description' },
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        if (verified?.nValue === 200 && verified?.description === 'Updated description') {
          this.context.logger.info('[CASE 1] PASSED | Normal columns updated correctly');
        } else {
          this.context.logger.error(
            '[CASE 1] FAILED | Values not updated: nValue=%s, description=%s',
            verified?.nValue,
            verified?.description,
          );
        }
      } else {
        this.context.logger.error('[CASE 1] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Simple JSON path update
  // ----------------------------------------------------------------
  async case2UpdateByIdSimpleJsonPath(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 2] Simple JSON path: jValue.theme');

    const code = `JSON_UPDATE_SIMPLE_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      // Create config with initial jValue
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: { theme: 'light', language: 'en' },
        },
      });

      const id = created.data.id;

      // Update using JSON path
      const updateResult = await repo.updateById({
        id,
        data: { 'jValue.theme': 'dark' } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;

        if (jValue?.theme === 'dark' && jValue?.language === 'en') {
          this.context.logger.info(
            '[CASE 2] PASSED | theme updated to "dark", language preserved as "en"',
          );
        } else {
          this.context.logger.error('[CASE 2] FAILED | jValue: %j', jValue);
        }
      } else {
        this.context.logger.error('[CASE 2] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Nested JSON path update
  // ----------------------------------------------------------------
  async case3UpdateByIdNestedJsonPath(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 3] Nested JSON path: jValue.settings.display.fontSize');

    const code = `JSON_UPDATE_NESTED_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {
            settings: {
              display: { fontSize: 12, theme: 'light' },
              notifications: { email: true },
            },
          },
        },
      });

      const id = created.data.id;

      // Update deeply nested path
      const updateResult = await repo.updateById({
        id,
        data: { 'jValue.settings.display.fontSize': 16 } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;
        const fontSize = jValue?.settings?.display?.fontSize;
        const theme = jValue?.settings?.display?.theme;
        const emailNotif = jValue?.settings?.notifications?.email;

        if (fontSize === 16 && theme === 'light' && emailNotif === true) {
          this.context.logger.info(
            '[CASE 3] PASSED | fontSize=16, theme="light", email=true (all preserved)',
          );
        } else {
          this.context.logger.error('[CASE 3] FAILED | jValue: %j', jValue);
        }
      } else {
        this.context.logger.error('[CASE 3] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Array index path update
  // ----------------------------------------------------------------
  async case4UpdateByIdArrayIndexPath(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 4] Array index path: jValue.addresses[0].primary');

    const code = `JSON_UPDATE_ARRAY_${getUID()}`;
    const group = 'JSON_UPDATE_TEST';

    try {
      const created = await repo.create({
        data: {
          code,
          group,
          dataType: DataTypes.JSON,
          jValue: {
            addresses: [
              { street: '123 Main St', primary: false },
              { street: '456 Oak Ave', primary: false },
            ],
          },
        },
      });

      const id = created.data.id;

      // Update array element using index
      const updateResult = await repo.updateById({
        id,
        data: { 'jValue.addresses[0].primary': true } as any,
      });

      if (updateResult.count === 1) {
        const verified = await repo.findById({ id });
        const jValue = verified?.jValue as Record<string, any>;
        const addr0Primary = jValue?.addresses?.[0]?.primary;
        const addr1Primary = jValue?.addresses?.[1]?.primary;
        const addr0Street = jValue?.addresses?.[0]?.street;

        if (addr0Primary === true && addr1Primary === false && addr0Street === '123 Main St') {
          this.context.logger.info(
            '[CASE 4] PASSED | addresses[0].primary=true, addresses[1].primary=false',
          );
        } else {
          this.context.logger.error('[CASE 4] FAILED | jValue: %j', jValue);
        }
      } else {
        this.context.logger.error('[CASE 4] FAILED | Update count: %d', updateResult.count);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }
}
