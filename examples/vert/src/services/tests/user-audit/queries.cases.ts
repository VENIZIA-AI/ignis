import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { eq } from 'drizzle-orm';
import { Configuration } from '../../../models/entities';
import { UserAuditCases } from './support';

// ----------------------------------------------------------------
// Queries Cases - reading audit fields back via verify, filter, relations, count/exists
// ----------------------------------------------------------------
export class QueriesCases extends UserAuditCases {
  // ----------------------------------------------------------------
  // CASE 9: Verify audit fields actually stored in database
  // ----------------------------------------------------------------
  async case9VerifyAuditFieldsStoredInDatabase(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 9] Verify audit fields are correctly stored in database');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_DB_VERIFY_${uniqueId}`;
      // Create real User for FK constraint
      const testUser = await this.createTestUser(`CASE9_DB_${uniqueId}`);

      // Create via repository
      await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_TEST',
          dataType: DataTypes.TEXT,
          createdBy: testUser,
          modifiedBy: testUser,
        },
      });

      // Query directly from database
      const connector = repo.connector;
      const [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.code, testCode));

      if (!dbRecord) {
        this.context.logger.error('[CASE 9] FAILED | Record not found via direct query');
        return;
      }

      // Verify exact match
      if (dbRecord.createdBy === testUser && dbRecord.modifiedBy === testUser) {
        this.context.logger.info(
          '[CASE 9] PASSED | Database stores correct values | createdBy: %s | modifiedBy: %s',
          dbRecord.createdBy,
          dbRecord.modifiedBy,
        );
      } else {
        this.context.logger.error(
          '[CASE 9] FAILED | Database values mismatch | createdBy: %s (expected: %s) | modifiedBy: %s (expected: %s)',
          dbRecord.createdBy,
          testUser,
          dbRecord.modifiedBy,
          testUser,
        );
      }

      // Also verify other fields are intact
      if (dbRecord.code === testCode && dbRecord.group === 'AUDIT_TEST') {
        this.context.logger.info('[CASE 9] PASSED | Other fields also stored correctly');
      }
    } catch (error) {
      this.context.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Filter/query by audit fields
  // ----------------------------------------------------------------
  async case10FilterByAuditFields(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 10] Filter records by createdBy and modifiedBy');

    try {
      const uniqueId = getUID();
      const group = `AUDIT_FILTER_${uniqueId}`;
      // Create real Users for FK constraint
      const userA = await this.createTestUser(`CASE10_A_${uniqueId}`);
      const userB = await this.createTestUser(`CASE10_B_${uniqueId}`);
      const userC = await this.createTestUser(`CASE10_C_${uniqueId}`);

      // Create records with different creators
      await repo.createAll({
        data: [
          {
            code: `${group}_1`,
            group,
            dataType: DataTypes.TEXT,
            createdBy: userA,
            modifiedBy: userA,
          },
          {
            code: `${group}_2`,
            group,
            dataType: DataTypes.TEXT,
            createdBy: userA,
            modifiedBy: userB,
          },
          {
            code: `${group}_3`,
            group,
            dataType: DataTypes.TEXT,
            createdBy: userB,
            modifiedBy: userB,
          },
          {
            code: `${group}_4`,
            group,
            dataType: DataTypes.TEXT,
            createdBy: userC,
            modifiedBy: userA,
          },
        ],
      });

      // Filter by createdBy
      const createdByA = await repo.find({
        filter: { where: { group, createdBy: userA } },
      });

      if (createdByA.length === 2) {
        this.context.logger.info(
          '[CASE 10] PASSED | Filter by createdBy | found %d records for userA',
          createdByA.length,
        );
      } else {
        this.context.logger.error(
          '[CASE 10] FAILED | Filter by createdBy | expected 2 | got %d',
          createdByA.length,
        );
      }

      // Filter by modifiedBy
      const modifiedByA = await repo.find({
        filter: { where: { group, modifiedBy: userA } },
      });

      if (modifiedByA.length === 2) {
        this.context.logger.info(
          '[CASE 10] PASSED | Filter by modifiedBy | found %d records modified by userA',
          modifiedByA.length,
        );
      } else {
        this.context.logger.error(
          '[CASE 10] FAILED | Filter by modifiedBy | expected 2 | got %d',
          modifiedByA.length,
        );
      }

      // Count by createdBy
      const countByCreator = await repo.count({
        where: { group, createdBy: userB },
      });

      if (countByCreator.count === 1) {
        this.context.logger.info(
          '[CASE 10] PASSED | Count by createdBy | userB created %d records',
          countByCreator.count,
        );
      } else {
        this.context.logger.error(
          '[CASE 10] FAILED | Count by createdBy | expected 1 | got %d',
          countByCreator.count,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Audit fields with relations
  // ----------------------------------------------------------------
  async case14AuditFieldsWithRelations(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 14] Audit fields accessible when including relations');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_RELATION_${uniqueId}`;

      // Create a user first for the relation
      const testUser = await this.context.userRepository.findOne({
        filter: { where: { realm: { like: 'AUDIT_%' } } },
      });

      let userId: string;
      if (!testUser) {
        const createdUser = await this.context.userRepository.create({
          data: {
            realm: `AUDIT_RELATION_USER_${uniqueId}`,
            username: `audit_relation_${uniqueId}`,
            email: `audit_relation_${uniqueId}@test.com`,
          },
        });
        userId = createdUser.data!.id;
      } else {
        userId = testUser.id;
      }

      // Create configuration with createdBy pointing to user
      await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_RELATION_TEST',
          dataType: DataTypes.TEXT,
          createdBy: userId,
          modifiedBy: userId,
        },
      });

      // Find with creator relation included
      const configWithCreator = await repo.findOne({
        filter: {
          where: { code: testCode },
          include: [{ relation: 'creator' }],
        },
      });

      if (!configWithCreator) {
        this.context.logger.error('[CASE 14] FAILED | Configuration not found');
        return;
      }

      const creator = (configWithCreator as any).creator;
      const hasAuditFields = 'createdBy' in configWithCreator && 'modifiedBy' in configWithCreator;

      if (hasAuditFields) {
        this.context.logger.info(
          '[CASE 14] PASSED | Audit fields present | createdBy: %s | modifiedBy: %s',
          (configWithCreator as any).createdBy,
          (configWithCreator as any).modifiedBy,
        );
      } else {
        this.context.logger.error(
          '[CASE 14] FAILED | Audit fields missing from result with relations',
        );
      }

      if (creator) {
        this.context.logger.info('[CASE 14] PASSED | Creator relation loaded | id: %s', creator.id);
      } else {
        this.context.logger.warn(
          '[CASE 14] INFO | Creator relation not loaded (may not be configured)',
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'AUDIT_RELATION_TEST' } });
    } catch (error) {
      this.context.logger.error('[CASE 14] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 17: Count and ExistsWith operations with audit field filters
  // ----------------------------------------------------------------
  async case17AuditFieldsInCountAndExists(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 17] Count and ExistsWith operations using audit field filters');

    try {
      const uniqueId = getUID();
      const group = `AUDIT_COUNT_EXISTS_${uniqueId}`;
      // Create real Users for FK constraint
      const userA = await this.createTestUser(`CASE17_A_${uniqueId}`);
      const userB = await this.createTestUser(`CASE17_B_${uniqueId}`);

      // Create test data
      await repo.createAll({
        data: [
          {
            code: `${group}_1`,
            group,
            dataType: DataTypes.TEXT,
            createdBy: userA,
            modifiedBy: userA,
          },
          {
            code: `${group}_2`,
            group,
            dataType: DataTypes.TEXT,
            createdBy: userA,
            modifiedBy: userB,
          },
          {
            code: `${group}_3`,
            group,
            dataType: DataTypes.TEXT,
            createdBy: userB,
            modifiedBy: userB,
          },
        ],
      });

      // Count by createdBy
      const countCreatedByA = await repo.count({ where: { group, createdBy: userA } });
      if (countCreatedByA.count === 2) {
        this.context.logger.info(
          '[CASE 17] PASSED | Count by createdBy | userA: %d',
          countCreatedByA.count,
        );
      } else {
        this.context.logger.error(
          '[CASE 17] FAILED | Count by createdBy | expected 2 | got %d',
          countCreatedByA.count,
        );
      }

      // ExistsWith by modifiedBy
      const existsModifiedByB = await repo.existsWith({ where: { group, modifiedBy: userB } });
      if (existsModifiedByB) {
        this.context.logger.info(
          '[CASE 17] PASSED | ExistsWith by modifiedBy | userB exists: true',
        );
      } else {
        this.context.logger.error('[CASE 17] FAILED | ExistsWith by modifiedBy | expected true');
      }

      // ExistsWith for non-existent user
      const existsNonExistent = await repo.existsWith({
        where: { group, createdBy: 'NON_EXISTENT_USER' },
      });
      if (!existsNonExistent) {
        this.context.logger.info(
          '[CASE 17] PASSED | ExistsWith for non-existent createdBy returns false',
        );
      } else {
        this.context.logger.error(
          '[CASE 17] FAILED | ExistsWith for non-existent should return false',
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[CASE 17] FAILED | Error: %s', (error as Error).message);
    }
  }
}
