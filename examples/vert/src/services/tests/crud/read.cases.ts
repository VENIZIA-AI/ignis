import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Read Cases - find, count, and exists operations
// ----------------------------------------------------------------
export class ReadCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 3: FindOne
  // ----------------------------------------------------------------
  async case3FindOne(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case3FindOne] FindOne');

    const code = `REPO_FINDONE_${getUID()}`;

    try {
      await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 555 },
      });

      const result = await repo.findOne({ filter: { where: { code } } });

      if (result?.code === code && result.nValue === 555) {
        this.context.logger.info(
          '[case3FindOne] PASSED | Found record | code: %s | nValue: %d',
          result.code,
          result.nValue,
        );
      } else {
        this.context.logger.error('[case3FindOne] FAILED | Unexpected result: %j', result);
      }

      const notFound = await repo.findOne({ filter: { where: { code: 'NON_EXISTENT_CODE' } } });
      if (notFound === null) {
        this.context.logger.info('[case3FindOne] PASSED | Non-existent record returns null');
      } else {
        this.context.logger.error('[case3FindOne] FAILED | Expected null for non-existent record');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[case3FindOne] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Find with filter (where, order, limit, offset)
  // ----------------------------------------------------------------
  async case4FindWithFilter(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case4FindWithFilter] Find with filter (where, order, limit, offset)');

    const group = `REPO_FILTER_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${group}_A`, group, dataType: DataTypes.NUMBER, nValue: 300 },
          { code: `${group}_B`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_C`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_D`, group, dataType: DataTypes.NUMBER, nValue: 400 },
          { code: `${group}_E`, group, dataType: DataTypes.NUMBER, nValue: 500 },
        ],
      });

      const whereResult = await repo.find({ filter: { where: { group } } });
      if (whereResult.length === 5) {
        this.context.logger.info(
          '[case4FindWithFilter] PASSED | Where filter | count: %d',
          whereResult.length,
        );
      } else {
        this.context.logger.error(
          '[case4FindWithFilter] FAILED | Expected 5 | got: %d',
          whereResult.length,
        );
      }

      const orderedAsc = await repo.find({
        filter: { where: { group }, order: ['nValue ASC'] },
      });
      if (orderedAsc[0]?.nValue === 100 && orderedAsc[4]?.nValue === 500) {
        this.context.logger.info('[case4FindWithFilter] PASSED | Order ASC works correctly');
      } else {
        this.context.logger.error(
          '[case4FindWithFilter] FAILED | Order ASC incorrect: %j',
          orderedAsc.map(r => r.nValue),
        );
      }

      const orderedDesc = await repo.find({
        filter: { where: { group }, order: ['nValue DESC'] },
      });
      if (orderedDesc[0]?.nValue === 500 && orderedDesc[4]?.nValue === 100) {
        this.context.logger.info('[case4FindWithFilter] PASSED | Order DESC works correctly');
      } else {
        this.context.logger.error(
          '[case4FindWithFilter] FAILED | Order DESC incorrect: %j',
          orderedDesc.map(r => r.nValue),
        );
      }

      const limited = await repo.find({
        filter: { where: { group }, limit: 2 },
      });
      if (limited.length === 2) {
        this.context.logger.info(
          '[case4FindWithFilter] PASSED | Limit | count: %d',
          limited.length,
        );
      } else {
        this.context.logger.error(
          '[case4FindWithFilter] FAILED | Limit expected 2 | got: %d',
          limited.length,
        );
      }

      const skipped = await repo.find({
        filter: { where: { group }, order: ['nValue ASC'], skip: 2, limit: 2 },
      });
      if (skipped.length === 2 && skipped[0]?.nValue === 300 && skipped[1]?.nValue === 400) {
        this.context.logger.info('[case4FindWithFilter] PASSED | Skip/offset works correctly');
      } else {
        this.context.logger.error(
          '[case4FindWithFilter] FAILED | Skip incorrect: %j',
          skipped.map(r => r.nValue),
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[case4FindWithFilter] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: FindById
  // ----------------------------------------------------------------
  async case5FindById(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case5FindById] FindById');

    const code = `REPO_FINDBYID_${getUID()}`;

    try {
      const created = await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 777 },
      });

      const id = created.data!.id;
      const result = await repo.findById({ id });

      if (result?.id === id && result.code === code) {
        this.context.logger.info('[case5FindById] PASSED | Found by id: %s', id);
      } else {
        this.context.logger.error('[case5FindById] FAILED | Unexpected result: %j', result);
      }

      const notFound = await repo.findById({ id: '00000000-0000-0000-0000-000000000000' });
      if (notFound === null) {
        this.context.logger.info('[case5FindById] PASSED | Non-existent id returns null');
      } else {
        this.context.logger.error('[case5FindById] FAILED | Expected null for non-existent id');
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[case5FindById] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Count operation
  // ----------------------------------------------------------------
  async case14CountOperation(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case14CountOperation] Count operation with various filters');

    const group = `REPO_COUNT_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 100 },
          { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 200 },
          { code: `${group}_3`, group, dataType: DataTypes.NUMBER, nValue: 300 },
          { code: `${group}_4`, group, dataType: DataTypes.NUMBER, nValue: 400 },
          { code: `${group}_5`, group, dataType: DataTypes.NUMBER, nValue: 500 },
        ],
      });

      // Count all in group
      const countAll = await repo.count({ where: { group } });
      if (countAll.count === 5) {
        this.context.logger.info('[case14CountOperation] PASSED | Count all: %d', countAll.count);
      } else {
        this.context.logger.error(
          '[case14CountOperation] FAILED | Expected 5 | got: %d',
          countAll.count,
        );
      }

      // Count with additional filter
      const countFiltered = await repo.count({
        where: { group, nValue: { gt: 200 } },
      });
      if (countFiltered.count === 3) {
        this.context.logger.info(
          '[case14CountOperation] PASSED | Count filtered (nValue > 200): %d',
          countFiltered.count,
        );
      } else {
        this.context.logger.error(
          '[case14CountOperation] FAILED | Expected 3 | got: %d',
          countFiltered.count,
        );
      }

      // Count with no matches
      const countNone = await repo.count({
        where: { group, nValue: { gt: 1000 } },
      });
      if (countNone.count === 0) {
        this.context.logger.info('[case14CountOperation] PASSED | Count with no matches: 0');
      } else {
        this.context.logger.error(
          '[case14CountOperation] FAILED | Expected 0 | got: %d',
          countNone.count,
        );
      }

      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[case14CountOperation] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: ExistsWith operation
  // ----------------------------------------------------------------
  async case15ExistsWithOperation(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case15ExistsWithOperation] ExistsWith operation');

    const code = `REPO_EXISTS_${getUID()}`;

    try {
      // Check before creating (should not exist)
      const existsBefore = await repo.existsWith({ where: { code } });
      if (!existsBefore) {
        this.context.logger.info(
          '[case15ExistsWithOperation] PASSED | Does not exist before create',
        );
      } else {
        this.context.logger.error(
          '[case15ExistsWithOperation] FAILED | Should not exist before create',
        );
      }

      // Create record
      await repo.create({
        data: { code, group: 'REPO_EXISTS_TEST', dataType: DataTypes.NUMBER, nValue: 123 },
      });

      // Check after creating (should exist)
      const existsAfter = await repo.existsWith({ where: { code } });
      if (existsAfter) {
        this.context.logger.info('[case15ExistsWithOperation] PASSED | Exists after create');
      } else {
        this.context.logger.error('[case15ExistsWithOperation] FAILED | Should exist after create');
      }

      // Delete and check again
      await repo.deleteAll({ where: { code } });

      const existsAfterDelete = await repo.existsWith({ where: { code } });
      if (!existsAfterDelete) {
        this.context.logger.info(
          '[case15ExistsWithOperation] PASSED | Does not exist after delete',
        );
      } else {
        this.context.logger.error(
          '[case15ExistsWithOperation] FAILED | Should not exist after delete',
        );
      }
    } catch (error) {
      this.context.logger.error('[case15ExistsWithOperation] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 18: Find with empty result set
  // ----------------------------------------------------------------
  async case18FindWithEmptyResult(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case18FindWithEmptyResult] Find with filter that matches nothing');

    const nonExistentGroup = `NON_EXISTENT_${getUID()}`;

    try {
      const results = await repo.find({
        filter: { where: { group: nonExistentGroup } },
      });

      if (Array.isArray(results) && results.length === 0) {
        this.context.logger.info(
          '[case18FindWithEmptyResult] PASSED | Empty array returned for no matches',
        );
      } else {
        this.context.logger.error(
          '[case18FindWithEmptyResult] FAILED | Expected empty array | got: %j',
          results,
        );
      }

      // Also test with complex filter
      const complexResults = await repo.find({
        filter: {
          where: {
            and: [
              { group: nonExistentGroup },
              { nValue: { gt: 100 } },
              { code: { like: 'IMPOSSIBLE%' } },
            ],
          },
        },
      });

      if (Array.isArray(complexResults) && complexResults.length === 0) {
        this.context.logger.info(
          '[case18FindWithEmptyResult] PASSED | Empty array for complex filter with no matches',
        );
      } else {
        this.context.logger.error(
          '[case18FindWithEmptyResult] FAILED | Complex filter | got: %j',
          complexResults,
        );
      }
    } catch (error) {
      this.context.logger.error('[case18FindWithEmptyResult] FAILED | Error: %s', error);
    }
  }
}
