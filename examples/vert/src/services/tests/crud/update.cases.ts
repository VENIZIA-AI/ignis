import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Update Cases - updateById and updateAll operations
// ----------------------------------------------------------------
export class UpdateCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 6: UpdateById
  // ----------------------------------------------------------------
  async case6UpdateById(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case6UpdateById] UpdateById');

    const code = `REPO_UPDATE_${getUID()}`;

    try {
      const created = await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
      });

      const id = created.data.id;
      const updateResult = await repo.updateById({
        id,
        data: { nValue: 999, description: 'Updated' },
      });

      if (updateResult.count === 1 && updateResult.data?.nValue === 999) {
        this.context.logger.info(
          '[case6UpdateById] PASSED | Updated record | nValue: %d',
          updateResult.data.nValue,
        );
      } else {
        this.context.logger.error('[case6UpdateById] FAILED | Update result: %j', updateResult);
      }

      const verified = await repo.findById({ id });
      if (verified?.nValue === 999 && verified?.description === 'Updated') {
        this.context.logger.info('[case6UpdateById] PASSED | Update verified in database');
      } else {
        this.context.logger.error('[case6UpdateById] FAILED | Update not persisted: %j', verified);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[case6UpdateById] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: UpdateAll / UpdateBy
  // ----------------------------------------------------------------
  async case7UpdateAll(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case7UpdateAll] UpdateAll / UpdateBy');

    const group = `REPO_UPDATEALL_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_3`, group, dataType: DataTypes.NUMBER, nValue: 300 },
        ],
      });

      const updateResult = await repo.updateAll({
        where: { group },
        data: { nValue: 999 },
      });

      if (updateResult.count === 3) {
        this.context.logger.info(
          '[case7UpdateAll] PASSED | UpdateAll affected | count: %d',
          updateResult.count,
        );
      } else {
        this.context.logger.error(
          '[case7UpdateAll] FAILED | Expected 3 | got: %d',
          updateResult.count,
        );
      }

      const verified = await repo.find({ filter: { where: { group } } });
      const allUpdated = verified.every(r => r.nValue === 999);
      if (allUpdated) {
        this.context.logger.info('[case7UpdateAll] PASSED | All records updated to nValue=999');
      } else {
        this.context.logger.error(
          '[case7UpdateAll] FAILED | Not all records updated: %j',
          verified.map(r => r.nValue),
        );
      }

      const updateByResult = await repo.updateBy({
        where: { group },
        data: { nValue: 888 },
      });
      if (updateByResult.count === 3) {
        this.context.logger.info('[case7UpdateAll] PASSED | UpdateBy works as alias for UpdateAll');
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[case7UpdateAll] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Update non-existent record
  // ----------------------------------------------------------------
  async case11UpdateNonExistentRecord(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case11UpdateNonExistentRecord] UpdateById for non-existent ID');

    const fakeId = '00000000-0000-0000-0000-000000000000';

    try {
      const result = await repo.updateById({
        id: fakeId,
        data: { description: 'This should not update anything' },
      });

      if (result.count === 0) {
        this.context.logger.info(
          '[case11UpdateNonExistentRecord] PASSED | Non-existent ID returns count: 0',
        );
      } else {
        this.context.logger.error(
          '[case11UpdateNonExistentRecord] FAILED | Expected count 0 | got: %d',
          result.count,
        );
      }
    } catch (error) {
      // Some implementations might throw an error - that's also valid
      this.context.logger.info(
        '[case11UpdateNonExistentRecord] PASSED | Non-existent ID handled (threw error): %s',
        (error as Error).message.substring(0, 50),
      );
    }
  }

  // ----------------------------------------------------------------
  // CASE 17: Update with partial data (only some fields)
  // ----------------------------------------------------------------
  async case17UpdateWithPartialData(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case17UpdateWithPartialData] Update only specific fields');

    const code = `REPO_PARTIAL_${getUID()}`;

    try {
      // Create with all fields
      const created = await repo.create({
        data: {
          code,
          group: 'REPO_PARTIAL_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 100,
          description: 'Original description',
        },
      });

      const id = created.data.id;

      // Update only one field
      await repo.updateById({
        id,
        data: { nValue: 999 },
      });

      // Verify only the updated field changed
      const updated = await repo.findById({ id });
      if (updated?.nValue === 999 && updated?.description === 'Original description') {
        this.context.logger.info(
          '[case17UpdateWithPartialData] PASSED | Only nValue updated | description preserved',
        );
      } else {
        this.context.logger.error(
          '[case17UpdateWithPartialData] FAILED | nValue: %d | description: %s',
          updated?.nValue,
          updated?.description,
        );
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[case17UpdateWithPartialData] FAILED | Error: %s', error);
    }
  }
}
