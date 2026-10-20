import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { eq } from 'drizzle-orm';
import { Configuration } from '../../../models/entities';
import { UserAuditCases } from './support';

// ----------------------------------------------------------------
// Modified-By Cases - modifiedBy across single, bulk, concurrent, and sequential updates
// ----------------------------------------------------------------
export class ModifiedByCases extends UserAuditCases {
  // ----------------------------------------------------------------
  // CASE 4: UpdateById - modifiedBy should change
  // ----------------------------------------------------------------
  async case4UpdateByIdModifiedByChanges(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 4] UpdateById - modifiedBy should change to new user');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_UPDATE_${uniqueId}`;
      // Create real Users for FK constraint
      const originalUser = await this.createTestUser(`CASE4_CREATOR_${uniqueId}`);
      const updaterUser = await this.createTestUser(`CASE4_UPDATER_${uniqueId}`);

      // Create record with original user
      const created = await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 100,
          createdBy: originalUser,
          modifiedBy: originalUser,
        },
      });

      if (!created.data) {
        this.context.logger.error('[CASE 4] FAILED | No data returned from create');
        return;
      }

      const recordId = created.data.id;

      // Update with different user in modifiedBy
      await repo.updateById({
        id: recordId,
        data: {
          nValue: 200,
          modifiedBy: updaterUser,
        },
      });

      // Verify changes
      const connector = repo.connector;
      const [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.id, recordId));

      if (!dbRecord) {
        this.context.logger.error('[CASE 4] FAILED | Record not found after update');
        return;
      }

      if (dbRecord.modifiedBy === updaterUser) {
        this.context.logger.info(
          '[CASE 4] PASSED | modifiedBy changed | original: %s | new: %s',
          originalUser,
          dbRecord.modifiedBy,
        );
      } else {
        this.context.logger.error(
          '[CASE 4] FAILED | modifiedBy did not change | expected: %s | got: %s',
          updaterUser,
          dbRecord.modifiedBy,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: UpdateAll (bulk) - modifiedBy changes for all
  // ----------------------------------------------------------------
  async case6UpdateAllBulkModifiedByChanges(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 6] UpdateAll - modifiedBy should change for all matching records');

    try {
      const uniqueId = getUID();
      const group = `AUDIT_UPDATEALL_${uniqueId}`;
      // Create real Users for FK constraint
      const originalUser = await this.createTestUser(`CASE6_ORIGINAL_${uniqueId}`);
      const bulkUpdater = await this.createTestUser(`CASE6_UPDATER_${uniqueId}`);

      // Create multiple records
      await repo.createAll({
        data: [
          {
            code: `${group}_1`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 100,
            createdBy: originalUser,
            modifiedBy: originalUser,
          },
          {
            code: `${group}_2`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 200,
            createdBy: originalUser,
            modifiedBy: originalUser,
          },
          {
            code: `${group}_3`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 300,
            createdBy: originalUser,
            modifiedBy: originalUser,
          },
        ],
      });

      // Bulk update with new modifiedBy
      await repo.updateAll({
        where: { group },
        data: {
          nValue: 999,
          modifiedBy: bulkUpdater,
        },
      });

      // Verify all records have updated modifiedBy
      const connector = repo.connector;
      const records = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.group, group));

      let allUpdated = true;
      let createdByPreserved = true;

      for (const record of records) {
        if (record.modifiedBy !== bulkUpdater) {
          allUpdated = false;
          this.context.logger.error(
            '[CASE 6] FAILED | modifiedBy not updated | code: %s | modifiedBy: %s',
            record.code,
            record.modifiedBy,
          );
        }
        if (record.createdBy !== originalUser) {
          createdByPreserved = false;
          this.context.logger.error(
            '[CASE 6] FAILED | createdBy changed unexpectedly | code: %s | createdBy: %s',
            record.code,
            record.createdBy,
          );
        }
      }

      if (allUpdated && createdByPreserved) {
        this.context.logger.info(
          '[CASE 6] PASSED | All %d records updated | modifiedBy: %s | createdBy preserved: %s',
          records.length,
          bulkUpdater,
          originalUser,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Update with different user (simulating user switch)
  // ----------------------------------------------------------------
  async case7UpdateWithDifferentUser(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 7] Simulate user switch - update by different user');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_USER_SWITCH_${uniqueId}`;
      // Create real Users for FK constraint
      const adminUser = await this.createTestUser(`CASE7_ADMIN_${uniqueId}`);
      const regularUser = await this.createTestUser(`CASE7_USER_${uniqueId}`);
      const supervisorUser = await this.createTestUser(`CASE7_SUPERVISOR_${uniqueId}`);

      // Admin creates the record
      const created = await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 100,
          createdBy: adminUser,
          modifiedBy: adminUser,
        },
      });

      if (!created.data) {
        this.context.logger.error('[CASE 7] FAILED | No data returned from create');
        return;
      }

      const recordId = created.data.id;

      // Regular user updates
      await repo.updateById({
        id: recordId,
        data: { nValue: 200, modifiedBy: regularUser },
      });

      // Verify regular user's update
      const connector = repo.connector;
      let [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.id, recordId));

      if (dbRecord?.modifiedBy !== regularUser) {
        this.context.logger.error(
          '[CASE 7] FAILED | First update modifiedBy incorrect | expected: %s | got: %s',
          regularUser,
          dbRecord?.modifiedBy,
        );
        return;
      }

      // Supervisor updates
      await repo.updateById({
        id: recordId,
        data: { nValue: 300, modifiedBy: supervisorUser },
      });

      // Verify supervisor's update
      [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.id, recordId));

      if (
        dbRecord?.createdBy === adminUser &&
        dbRecord?.modifiedBy === supervisorUser &&
        dbRecord?.nValue === 300
      ) {
        this.context.logger.info(
          '[CASE 7] PASSED | User switch tracked | createdBy: %s | modifiedBy: %s (after 2 updates)',
          dbRecord.createdBy,
          dbRecord.modifiedBy,
        );
      } else {
        this.context.logger.error(
          '[CASE 7] FAILED | createdBy: %s | modifiedBy: %s | nValue: %d',
          dbRecord?.createdBy,
          dbRecord?.modifiedBy,
          dbRecord?.nValue,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Concurrent updates - last write wins for modifiedBy
  // ----------------------------------------------------------------
  async case13ConcurrentUpdatesModifiedBy(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 13] Concurrent updates - verify modifiedBy reflects last writer');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_CONCURRENT_${uniqueId}`;
      // Create real Users for FK constraint
      const creator = await this.createTestUser(`CASE13_CREATOR_${uniqueId}`);
      // Create 5 concurrent users
      const users = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          this.createTestUser(`CASE13_CONCURRENT_${i}_${uniqueId}`),
        ),
      );

      // Create initial record
      const created = await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_CONCURRENT_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 100,
          createdBy: creator,
          modifiedBy: creator,
        },
      });

      if (!created.data) {
        this.context.logger.error('[CASE 13] FAILED | Record creation failed');
        return;
      }

      const recordId = created.data.id;

      // Launch concurrent updates with different users
      const updatePromises = users.map((user, idx) =>
        repo
          .updateById({
            id: recordId,
            data: { nValue: (idx + 1) * 100, modifiedBy: user },
          })
          .catch(err => ({ error: err })),
      );

      await Promise.all(updatePromises);

      // Verify final state
      const connector = repo.connector;
      const [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.id, recordId));

      if (!dbRecord) {
        this.context.logger.error('[CASE 13] FAILED | Record not found after concurrent updates');
        return;
      }

      // createdBy should still be original
      if (dbRecord.createdBy === creator) {
        this.context.logger.info(
          '[CASE 13] PASSED | createdBy preserved during concurrent updates',
        );
      } else {
        this.context.logger.error('[CASE 13] FAILED | createdBy changed during concurrent updates');
      }

      // modifiedBy should be one of the concurrent users
      if (users.includes(dbRecord.modifiedBy as string)) {
        this.context.logger.info(
          '[CASE 13] PASSED | modifiedBy is one of concurrent users | value: %s',
          dbRecord.modifiedBy,
        );
      } else {
        this.context.logger.error(
          '[CASE 13] FAILED | modifiedBy has unexpected value | value: %s',
          dbRecord.modifiedBy,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'AUDIT_CONCURRENT_TEST' } });
    } catch (error) {
      this.context.logger.error('[CASE 13] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: Multiple sequential updates track modifiedBy correctly
  // ----------------------------------------------------------------
  async case15MultipleSequentialUpdates(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 15] Multiple sequential updates track modifiedBy history');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_SEQUENTIAL_${uniqueId}`;
      // Create real Users for FK constraint
      const creator = await this.createTestUser(`CASE15_CREATOR_${uniqueId}`);
      const users = await Promise.all(
        ['EDITOR1', 'EDITOR2', 'EDITOR3', 'REVIEWER', 'APPROVER'].map(name =>
          this.createTestUser(`CASE15_${name}_${uniqueId}`),
        ),
      );

      // Create
      const created = await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_SEQUENTIAL_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 0,
          createdBy: creator,
          modifiedBy: creator,
        },
      });

      if (!created.data) {
        this.context.logger.error('[CASE 15] FAILED | Record creation failed');
        return;
      }

      const recordId = created.data.id;
      const connector = repo.connector;

      // Sequential updates by different users
      for (let i = 0; i < users.length; i++) {
        await repo.updateById({
          id: recordId,
          data: { nValue: (i + 1) * 10, modifiedBy: users[i] },
        });

        // Verify each update
        const [dbRecord] = await connector
          .select()
          .from(Configuration.schema)
          .where(eq(Configuration.schema.id, recordId));

        if (dbRecord?.modifiedBy !== users[i]) {
          this.context.logger.error(
            '[CASE 15] FAILED | Update %d | expected modifiedBy: %s | got: %s',
            i + 1,
            users[i],
            dbRecord?.modifiedBy,
          );
        } else if (dbRecord?.createdBy !== creator) {
          this.context.logger.error(
            '[CASE 15] FAILED | Update %d | createdBy changed to: %s',
            i + 1,
            dbRecord?.createdBy,
          );
        }
      }

      // Verify final state
      const [finalRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.id, recordId));

      if (
        finalRecord?.createdBy === creator &&
        finalRecord?.modifiedBy === users[users.length - 1] &&
        finalRecord?.nValue === 50
      ) {
        this.context.logger.info(
          '[CASE 15] PASSED | %d sequential updates | createdBy: %s | final modifiedBy: %s',
          users.length,
          finalRecord.createdBy,
          finalRecord.modifiedBy,
        );
      } else {
        this.context.logger.error(
          '[CASE 15] FAILED | Final state | createdBy: %s | modifiedBy: %s | nValue: %d',
          finalRecord?.createdBy,
          finalRecord?.modifiedBy,
          finalRecord?.nValue,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'AUDIT_SEQUENTIAL_TEST' } });
    } catch (error) {
      this.context.logger.error('[CASE 15] FAILED | Error: %s', (error as Error).message);
    }
  }
}
