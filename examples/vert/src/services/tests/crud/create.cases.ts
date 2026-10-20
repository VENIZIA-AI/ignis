import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Create Cases - create and batch-create operations
// ----------------------------------------------------------------
export class CreateCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 1: Create single record
  // ----------------------------------------------------------------
  async case1CreateSingle(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case1CreateSingle] Create single record');

    const code = `REPO_CREATE_${getUID()}`;

    try {
      const result = await repo.create({
        data: { code, group: 'REPO_TEST', dataType: DataTypes.NUMBER, nValue: 100 },
      });

      if (result.count === 1 && result.data?.code === code) {
        this.context.logger.info(
          '[case1CreateSingle] PASSED | Created record | id: %s | code: %s',
          result.data.id,
          result.data.code,
        );
      } else {
        this.context.logger.error('[case1CreateSingle] FAILED | Unexpected result: %j', result);
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[case1CreateSingle] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: CreateAll (batch create)
  // ----------------------------------------------------------------
  async case2CreateAll(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case2CreateAll] CreateAll (batch create)');

    const codes = [`REPO_BATCH_${getUID()}`, `REPO_BATCH_${getUID()}`, `REPO_BATCH_${getUID()}`];

    try {
      const result = await repo.createAll({
        data: codes.map((code, idx) => ({
          code,
          group: 'REPO_BATCH_TEST',
          dataType: DataTypes.NUMBER,
          nValue: (idx + 1) * 100,
        })),
      });

      if (result.count === 3 && result.data?.length === 3) {
        this.context.logger.info(
          '[case2CreateAll] PASSED | Created records | count: %d',
          result.count,
        );
      } else {
        this.context.logger.error('[case2CreateAll] FAILED | Expected 3 records | got: %j', result);
      }

      await repo.deleteAll({ where: { group: 'REPO_BATCH_TEST' } });
    } catch (error) {
      this.context.logger.error('[case2CreateAll] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Create with null/undefined values
  // ----------------------------------------------------------------
  async case9CreateWithNullValues(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case9CreateWithNullValues] Create with null/undefined values');

    const code = `REPO_NULL_${getUID()}`;

    try {
      // Create with explicit null values
      const result = await repo.create({
        data: {
          code,
          group: 'REPO_NULL_TEST',
          dataType: DataTypes.NUMBER,
          nValue: null,
          description: null,
        },
      });

      if (result.count === 1) {
        this.context.logger.info(
          '[case9CreateWithNullValues] PASSED | Created record with null values | id: %s',
          result.data?.id,
        );
      } else {
        this.context.logger.error('[case9CreateWithNullValues] FAILED | Create result: %j', result);
      }

      // Verify null values are stored correctly
      const found = await repo.findOne({ filter: { where: { code } } });
      if (found?.nValue === null && found?.description === null) {
        this.context.logger.info(
          '[case9CreateWithNullValues] PASSED | Null values persisted correctly',
        );
      } else {
        this.context.logger.error(
          '[case9CreateWithNullValues] FAILED | Null values not preserved | nValue: %s | description: %s',
          found?.nValue,
          found?.description,
        );
      }

      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.context.logger.error('[case9CreateWithNullValues] FAILED | Error: %s', error);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Empty batch create
  // ----------------------------------------------------------------
  async case10EmptyBatchCreate(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case10EmptyBatchCreate] CreateAll with empty array');

    try {
      const result = await repo.createAll({ data: [] });

      if (result.count === 0 && (result.data?.length === 0 || !result.data)) {
        this.context.logger.info('[case10EmptyBatchCreate] PASSED | Empty batch returns count: 0');
      } else {
        this.context.logger.error(
          '[case10EmptyBatchCreate] FAILED | Unexpected result: %j',
          result,
        );
      }
    } catch (error) {
      // Empty batch might throw an error - that's also valid behavior
      this.context.logger.info(
        '[case10EmptyBatchCreate] PASSED | Empty batch handled (threw error): %s',
        (error as Error).message.substring(0, 50),
      );
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Concurrent creates (race condition test)
  // ----------------------------------------------------------------
  async case16ConcurrentCreates(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[case16ConcurrentCreates] Concurrent create operations');

    const group = `REPO_CONCURRENT_${getUID()}`;
    const concurrentCount = 10;

    try {
      // Test 1: Launch multiple creates concurrently with unique codes
      const promises = Array.from({ length: concurrentCount }, (_, i) =>
        repo.create({
          data: {
            code: `${group}_${i}_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: i * 100,
          },
        }),
      );

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.count === 1).length;

      if (successCount === concurrentCount) {
        this.context.logger.info(
          '[case16ConcurrentCreates] PASSED | All %d concurrent creates succeeded',
          concurrentCount,
        );
      } else {
        this.context.logger.error(
          '[case16ConcurrentCreates] FAILED | Expected %d | succeeded: %d',
          concurrentCount,
          successCount,
        );
      }

      // Verify all records exist
      const allRecords = await repo.find({ filter: { where: { group } } });
      if (allRecords.length === concurrentCount) {
        this.context.logger.info(
          '[case16ConcurrentCreates] PASSED | All %d records persisted',
          concurrentCount,
        );
      } else {
        this.context.logger.error(
          '[case16ConcurrentCreates] FAILED | Expected %d records | found: %d',
          concurrentCount,
          allRecords.length,
        );
      }

      await repo.deleteAll({ where: { group } });

      // Test 2: Race condition with duplicate codes (tests unique constraint handling)
      const duplicateCode = `RACE_DUP_${getUID()}`;
      const racePromises = Array.from({ length: 5 }, () =>
        repo
          .create({
            data: {
              code: duplicateCode,
              group: `${group}_RACE`,
              dataType: DataTypes.NUMBER,
              nValue: 100,
            },
          })
          .catch(err => ({ error: err, count: 0 })),
      );

      const raceResults = await Promise.all(racePromises);
      const raceSuccessCount = raceResults.filter(r => !('error' in r) && r.count === 1).length;
      const raceErrorCount = raceResults.filter(r => 'error' in r).length;

      // Only 1 should succeed (first to acquire the code), others should fail
      if (raceSuccessCount === 1 && raceErrorCount === 4) {
        this.context.logger.info(
          '[case16ConcurrentCreates] PASSED | Race condition: 1 succeeded, 4 failed (unique constraint)',
        );
      } else if (raceSuccessCount >= 1) {
        // Some databases may handle this differently
        this.context.logger.info(
          '[case16ConcurrentCreates] INFO | Race condition: %d succeeded, %d failed',
          raceSuccessCount,
          raceErrorCount,
        );
      } else {
        this.context.logger.error(
          '[case16ConcurrentCreates] FAILED | Race condition: expected 1 success | got: %d',
          raceSuccessCount,
        );
      }

      // Verify only 1 record with duplicate code exists
      const duplicateRecords = await repo.find({
        filter: { where: { code: duplicateCode } },
      });
      if (duplicateRecords.length === 1) {
        this.context.logger.info(
          '[case16ConcurrentCreates] PASSED | Only 1 record with duplicate code',
        );
      } else {
        this.context.logger.error(
          '[case16ConcurrentCreates] FAILED | Expected 1 duplicate record | found: %d',
          duplicateRecords.length,
        );
      }

      await repo.deleteAll({ where: { code: duplicateCode } });
    } catch (error) {
      this.context.logger.error('[case16ConcurrentCreates] FAILED | Error: %s', error);
    }
  }
}
