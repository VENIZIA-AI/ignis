import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Delete Cases - deleteById and deleteAll operations
// ----------------------------------------------------------------
export class DeleteCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 8: DeleteById and DeleteAll
  // ----------------------------------------------------------------
  async case8DeleteByIdAndDeleteAll(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case8DeleteByIdAndDeleteAll] DeleteById and DeleteAll');

    const group = `REPO_DELETE_${getUID()}`;

    try {
      const created = await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_3`, group, dataType: DataTypes.NUMBER, nValue: 300 },
        ],
      });

      const firstId = created.data![0].id;
      const deleteByIdResult = await repo.deleteById({ id: firstId });

      if (deleteByIdResult.count === 1 && deleteByIdResult.data?.id === firstId) {
        this.context.logger.info(
          '[case8DeleteByIdAndDeleteAll] PASSED | DeleteById removed record | id: %s',
          firstId,
        );
      } else {
        this.context.logger.error(
          '[case8DeleteByIdAndDeleteAll] FAILED | DeleteById result: %j',
          deleteByIdResult,
        );
      }

      const verifyDeleted = await repo.findById({ id: firstId });
      if (verifyDeleted === null) {
        this.context.logger.info(
          '[case8DeleteByIdAndDeleteAll] PASSED | DeleteById verified (record not found)',
        );
      } else {
        this.context.logger.error(
          '[case8DeleteByIdAndDeleteAll] FAILED | Record still exists after DeleteById',
        );
      }

      const deleteAllResult = await repo.deleteAll({ where: { group } });
      if (deleteAllResult.count === 2) {
        this.context.logger.info(
          '[case8DeleteByIdAndDeleteAll] PASSED | DeleteAll removed remaining records | count: %d',
          deleteAllResult.count,
        );
      } else {
        this.context.logger.error(
          '[case8DeleteByIdAndDeleteAll] FAILED | DeleteAll expected 2 | got: %d',
          deleteAllResult.count,
        );
      }

      const remaining = await repo.find({ filter: { where: { group } } });
      if (remaining.length === 0) {
        this.context.logger.info('[case8DeleteByIdAndDeleteAll] PASSED | All records deleted');
      } else {
        this.context.logger.error(
          '[case8DeleteByIdAndDeleteAll] FAILED | Records still remain | count: %d',
          remaining.length,
        );
      }
    } catch (error) {
      this.context.logger.error('[case8DeleteByIdAndDeleteAll] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Delete non-existent record
  // ----------------------------------------------------------------
  async case12DeleteNonExistentRecord(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case12DeleteNonExistentRecord] DeleteById for non-existent ID');

    const fakeId = '00000000-0000-0000-0000-000000000000';

    try {
      const result = await repo.deleteById({ id: fakeId });

      if (result.count === 0) {
        this.context.logger.info(
          '[case12DeleteNonExistentRecord] PASSED | Non-existent ID returns count: 0',
        );
      } else {
        this.context.logger.error(
          '[case12DeleteNonExistentRecord] FAILED | Expected count 0 | got: %d',
          result.count,
        );
      }
    } catch (error) {
      // Some implementations might throw an error - that's also valid
      this.context.logger.info(
        '[case12DeleteNonExistentRecord] PASSED | Non-existent ID handled (threw error): %s',
        (error as Error).message.substring(0, 50),
      );
    }
  }
}
