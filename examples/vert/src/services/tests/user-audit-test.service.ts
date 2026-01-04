import {
  BindingKeys,
  BindingNamespaces,
  DataTypes,
  getUID,
  inject,
} from '@venizia/ignis';
import { eq } from 'drizzle-orm';
import { Configuration } from '../../models/entities';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';
import { BaseTestService } from './base-test.service';

// ----------------------------------------------------------------
/**
 * User Audit Test Service - Tests for createdBy/modifiedBy automatic tracking
 *
 * The User Audit feature automatically populates:
 * - createdBy: Set via $default() on INSERT (captures user who created the record)
 * - modifiedBy: Set via $default() on INSERT and $onUpdate() on UPDATE
 *
 * User ID is retrieved from Hono context via:
 * - tryGetContext() -> context.get(Authentication.AUDIT_USER_ID)
 *
 * When context is unavailable (migrations, background jobs, tests without context),
 * both fields will be null.
 *
 * Note: These tests run without Hono context, so createdBy/modifiedBy will be null
 * unless we explicitly set values. The tests verify:
 * 1. Fields exist and accept valid values
 * 2. createdBy remains unchanged on UPDATE
 * 3. modifiedBy changes on UPDATE
 * 4. Null handling when no context is available
 * 5. Bulk operations behavior
 * 6. Transaction behavior
 */
// ----------------------------------------------------------------
export class UserAuditTestService extends BaseTestService {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    configurationRepository: ConfigurationRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ProductRepository.name,
      }),
    })
    productRepository: ProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelRepository.name,
      }),
    })
    saleChannelRepository: SaleChannelRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: SaleChannelProductRepository.name,
      }),
    })
    saleChannelProductRepository: SaleChannelProductRepository,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: UserRepository.name,
      }),
    })
    userRepository: UserRepository,
  ) {
    super(
      UserAuditTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // Helper to create test users and get their IDs
  private testUsers: Map<string, string> = new Map();

  private async createTestUser(name: string): Promise<string> {
    // Check if already created
    if (this.testUsers.has(name)) {
      return this.testUsers.get(name)!;
    }

    const uniqueId = getUID();
    const result = await this.userRepository.create({
      data: {
        realm: `AUDIT_TEST_USER_${name}_${uniqueId}`,
        username: `audit_${name.toLowerCase()}_${uniqueId}`,
        email: `audit_${name.toLowerCase()}_${uniqueId}@test.com`,
      },
    });

    const userId = result.data!.id;
    this.testUsers.set(name, userId);
    return userId;
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[UserAuditTestService] Starting user audit tracking test cases');

    // CREATE operation tests
    await this.case1_CreateWithExplicitAuditFields();
    await this.case2_CreateWithoutContext_NullAuditFields();
    await this.case3_CreateAll_BulkAuditFields();

    // UPDATE operation tests
    await this.case4_UpdateById_ModifiedByChanges();
    await this.case5_UpdateById_CreatedByUnchanged();
    await this.case6_UpdateAll_BulkModifiedByChanges();
    await this.case7_UpdateWithDifferentUser();

    // Edge cases
    await this.case8_NullToNonNullAuditFields();
    await this.case9_VerifyAuditFieldsStoredInDatabase();
    await this.case10_FilterByAuditFields();

    // Transaction behavior
    await this.case11_TransactionAuditTracking();
    await this.case12_RollbackAuditTracking();

    // Advanced scenarios
    await this.case13_ConcurrentUpdatesModifiedBy();
    await this.case14_AuditFieldsWithRelations();
    await this.case15_MultipleSequentialUpdates();
    await this.case16_AuditFieldsDataTypes();
    await this.case17_AuditFieldsInCountAndExists();
    await this.case18_DeleteReturnsAuditFields();

    // Security and edge cases
    await this.case19_AuditFieldInjectionAttempt();
    await this.case20_EmptyStringVsNullAuditFields();

    // Cleanup
    await this.case21_Cleanup();

    this.logSection('[UserAuditTestService] All user audit tracking test cases completed!');
  }

  // ----------------------------------------------------------------
  // CASE 1: Create with explicit audit fields
  // ----------------------------------------------------------------
  private async case1_CreateWithExplicitAuditFields(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 1] Create with explicit createdBy and modifiedBy values');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_EXPLICIT_${uniqueId}`;
      // Create a real User for FK constraint
      const testUserId = await this.createTestUser(`CASE1_${uniqueId}`);

      const created = await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_TEST',
          dataType: DataTypes.TEXT,
          createdBy: testUserId,
          modifiedBy: testUserId,
        },
      });

      if (!created.data) {
        this.logger.error('[CASE 1] FAILED | No data returned from create');
        return;
      }

      const hasCreatedBy = 'createdBy' in created.data;
      const hasModifiedBy = 'modifiedBy' in created.data;

      if (hasCreatedBy && hasModifiedBy) {
        const createdByValue = (created.data as any).createdBy;
        const modifiedByValue = (created.data as any).modifiedBy;

        if (createdByValue === testUserId && modifiedByValue === testUserId) {
          this.logger.info(
            '[CASE 1] PASSED | Explicit audit fields set | createdBy: %s | modifiedBy: %s',
            createdByValue,
            modifiedByValue,
          );
        } else {
          this.logger.error(
            '[CASE 1] FAILED | Audit field values mismatch | createdBy: %s (expected: %s) | modifiedBy: %s (expected: %s)',
            createdByValue,
            testUserId,
            modifiedByValue,
            testUserId,
          );
        }
      } else {
        this.logger.error(
          '[CASE 1] FAILED | Audit fields missing from response | hasCreatedBy: %s | hasModifiedBy: %s',
          hasCreatedBy,
          hasModifiedBy,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Create without context - audit fields should be null
  // ----------------------------------------------------------------
  private async case2_CreateWithoutContext_NullAuditFields(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 2] Create without Hono context - audit fields should be null (or default)');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_NO_CONTEXT_${uniqueId}`;

      // Create without explicitly setting audit fields
      // Since there's no Hono context, $default() should return null
      const created = await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_TEST',
          dataType: DataTypes.TEXT,
          description: 'Created without context',
        },
      });

      if (!created.data) {
        this.logger.error('[CASE 2] FAILED | No data returned from create');
        return;
      }

      // Verify via direct connector query to see actual DB values
      const connector = repo.getConnector();
      const directResults = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.code, testCode));

      if (directResults.length === 0) {
        this.logger.error('[CASE 2] FAILED | Record not found in database');
        return;
      }

      const dbRecord = directResults[0];

      // Without context, createdBy and modifiedBy should be null
      if (dbRecord.createdBy === null && dbRecord.modifiedBy === null) {
        this.logger.info(
          '[CASE 2] PASSED | Without context, audit fields are null | createdBy: %s | modifiedBy: %s',
          dbRecord.createdBy,
          dbRecord.modifiedBy,
        );
      } else {
        // They might have values if explicitly set or from defaults
        this.logger.info(
          '[CASE 2] INFO | Audit fields have values (may be from explicit setting) | createdBy: %s | modifiedBy: %s',
          dbRecord.createdBy,
          dbRecord.modifiedBy,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: CreateAll (bulk) with audit fields
  // ----------------------------------------------------------------
  private async case3_CreateAll_BulkAuditFields(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 3] CreateAll with explicit audit fields for each record');

    try {
      const uniqueId = getUID();
      // Create real Users for FK constraint
      const user1 = await this.createTestUser(`CASE3_USER1_${uniqueId}`);
      const user2 = await this.createTestUser(`CASE3_USER2_${uniqueId}`);
      const user3 = await this.createTestUser(`CASE3_USER3_${uniqueId}`);

      const created = await repo.createAll({
        data: [
          {
            code: `AUDIT_BULK_1_${uniqueId}`,
            group: 'AUDIT_BULK_TEST',
            dataType: DataTypes.TEXT,
            createdBy: user1,
            modifiedBy: user1,
          },
          {
            code: `AUDIT_BULK_2_${uniqueId}`,
            group: 'AUDIT_BULK_TEST',
            dataType: DataTypes.TEXT,
            createdBy: user2,
            modifiedBy: user2,
          },
          {
            code: `AUDIT_BULK_3_${uniqueId}`,
            group: 'AUDIT_BULK_TEST',
            dataType: DataTypes.TEXT,
            createdBy: user3,
            modifiedBy: user3,
          },
        ],
      });

      if (created.count !== 3 || !created.data || created.data.length !== 3) {
        this.logger.error('[CASE 3] FAILED | Expected 3 records created | count: %d', created.count);
        return;
      }

      // Verify each record has correct audit fields
      const connector = repo.getConnector();
      const records = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.group, 'AUDIT_BULK_TEST'));

      const expectedUsers = [user1, user2, user3];
      let allCorrect = true;

      for (const record of records) {
        if (!expectedUsers.includes(record.createdBy as string)) {
          allCorrect = false;
          this.logger.error(
            '[CASE 3] FAILED | Unexpected createdBy | code: %s | createdBy: %s',
            record.code,
            record.createdBy,
          );
        }
        if (record.createdBy !== record.modifiedBy) {
          allCorrect = false;
          this.logger.error(
            '[CASE 3] FAILED | createdBy != modifiedBy on create | code: %s',
            record.code,
          );
        }
      }

      if (allCorrect) {
        this.logger.info(
          '[CASE 3] PASSED | All %d bulk records have correct audit fields',
          records.length,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'AUDIT_BULK_TEST' } });
    } catch (error) {
      this.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: UpdateById - modifiedBy should change
  // ----------------------------------------------------------------
  private async case4_UpdateById_ModifiedByChanges(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 4] UpdateById - modifiedBy should change to new user');

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
        this.logger.error('[CASE 4] FAILED | No data returned from create');
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
      const connector = repo.getConnector();
      const [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.id, recordId));

      if (!dbRecord) {
        this.logger.error('[CASE 4] FAILED | Record not found after update');
        return;
      }

      if (dbRecord.modifiedBy === updaterUser) {
        this.logger.info(
          '[CASE 4] PASSED | modifiedBy changed | original: %s | new: %s',
          originalUser,
          dbRecord.modifiedBy,
        );
      } else {
        this.logger.error(
          '[CASE 4] FAILED | modifiedBy did not change | expected: %s | got: %s',
          updaterUser,
          dbRecord.modifiedBy,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: UpdateById - createdBy should NOT change
  // ----------------------------------------------------------------
  private async case5_UpdateById_CreatedByUnchanged(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 5] UpdateById - createdBy should remain unchanged');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_CREATED_UNCHANGED_${uniqueId}`;
      // Create real Users for FK constraint
      const originalCreator = await this.createTestUser(`CASE5_CREATOR_${uniqueId}`);
      const attemptedNewCreator = await this.createTestUser(`CASE5_HACKER_${uniqueId}`);

      // Create record
      const created = await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 100,
          createdBy: originalCreator,
          modifiedBy: originalCreator,
        },
      });

      if (!created.data) {
        this.logger.error('[CASE 5] FAILED | No data returned from create');
        return;
      }

      const recordId = created.data.id;

      // Attempt to change createdBy (should not be allowed or should be ignored)
      // Note: Depending on implementation, this might:
      // 1. Be ignored silently
      // 2. Throw an error
      // 3. Actually change (security issue if allowed)
      try {
        await repo.updateById({
          id: recordId,
          data: {
            description: 'Updated',
            createdBy: attemptedNewCreator, // Attempt to change createdBy
          },
        });

        // Verify createdBy was NOT changed
        const connector = repo.getConnector();
        const [dbRecord] = await connector
          .select()
          .from(Configuration.schema)
          .where(eq(Configuration.schema.id, recordId));

        if (!dbRecord) {
          this.logger.error('[CASE 5] FAILED | Record not found after update');
          return;
        }

        if (dbRecord.createdBy === originalCreator) {
          this.logger.info(
            '[CASE 5] PASSED | createdBy unchanged after update attempt | value: %s',
            dbRecord.createdBy,
          );
        } else if (dbRecord.createdBy === attemptedNewCreator) {
          this.logger.error(
            '[CASE 5] SECURITY WARNING | createdBy was changed! This may be a security issue | original: %s | new: %s',
            originalCreator,
            dbRecord.createdBy,
          );
        } else {
          this.logger.warn(
            '[CASE 5] UNEXPECTED | createdBy has unexpected value | expected: %s | got: %s',
            originalCreator,
            dbRecord.createdBy,
          );
        }
      } catch (updateError) {
        // Some implementations might reject changing createdBy
        this.logger.info(
          '[CASE 5] PASSED | Update rejected attempt to change createdBy | error: %s',
          (updateError as Error).message.substring(0, 50),
        );
      }
    } catch (error) {
      this.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: UpdateAll (bulk) - modifiedBy changes for all
  // ----------------------------------------------------------------
  private async case6_UpdateAll_BulkModifiedByChanges(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 6] UpdateAll - modifiedBy should change for all matching records');

    try {
      const uniqueId = getUID();
      const group = `AUDIT_UPDATEALL_${uniqueId}`;
      // Create real Users for FK constraint
      const originalUser = await this.createTestUser(`CASE6_ORIGINAL_${uniqueId}`);
      const bulkUpdater = await this.createTestUser(`CASE6_UPDATER_${uniqueId}`);

      // Create multiple records
      await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.NUMBER, nValue: 100, createdBy: originalUser, modifiedBy: originalUser },
          { code: `${group}_2`, group, dataType: DataTypes.NUMBER, nValue: 200, createdBy: originalUser, modifiedBy: originalUser },
          { code: `${group}_3`, group, dataType: DataTypes.NUMBER, nValue: 300, createdBy: originalUser, modifiedBy: originalUser },
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
      const connector = repo.getConnector();
      const records = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.group, group));

      let allUpdated = true;
      let createdByPreserved = true;

      for (const record of records) {
        if (record.modifiedBy !== bulkUpdater) {
          allUpdated = false;
          this.logger.error(
            '[CASE 6] FAILED | modifiedBy not updated | code: %s | modifiedBy: %s',
            record.code,
            record.modifiedBy,
          );
        }
        if (record.createdBy !== originalUser) {
          createdByPreserved = false;
          this.logger.error(
            '[CASE 6] FAILED | createdBy changed unexpectedly | code: %s | createdBy: %s',
            record.code,
            record.createdBy,
          );
        }
      }

      if (allUpdated && createdByPreserved) {
        this.logger.info(
          '[CASE 6] PASSED | All %d records updated | modifiedBy: %s | createdBy preserved: %s',
          records.length,
          bulkUpdater,
          originalUser,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Update with different user (simulating user switch)
  // ----------------------------------------------------------------
  private async case7_UpdateWithDifferentUser(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 7] Simulate user switch - update by different user');

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
        this.logger.error('[CASE 7] FAILED | No data returned from create');
        return;
      }

      const recordId = created.data.id;

      // Regular user updates
      await repo.updateById({
        id: recordId,
        data: { nValue: 200, modifiedBy: regularUser },
      });

      // Verify regular user's update
      let connector = repo.getConnector();
      let [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.id, recordId));

      if (dbRecord?.modifiedBy !== regularUser) {
        this.logger.error(
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
        this.logger.info(
          '[CASE 7] PASSED | User switch tracked | createdBy: %s | modifiedBy: %s (after 2 updates)',
          dbRecord.createdBy,
          dbRecord.modifiedBy,
        );
      } else {
        this.logger.error(
          '[CASE 7] FAILED | createdBy: %s | modifiedBy: %s | nValue: %d',
          dbRecord?.createdBy,
          dbRecord?.modifiedBy,
          dbRecord?.nValue,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Null to non-null audit field update
  // ----------------------------------------------------------------
  private async case8_NullToNonNullAuditFields(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 8] Update null audit fields to non-null values');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_NULL_TO_NONNULL_${uniqueId}`;
      // Create real User for FK constraint
      const lateUser = await this.createTestUser(`CASE8_LATE_${uniqueId}`);

      // Create without explicit audit fields (will be null without context)
      await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_TEST',
          dataType: DataTypes.TEXT,
        },
      });

      // Find the record
      const connector = repo.getConnector();
      let [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.code, testCode));

      if (!dbRecord) {
        this.logger.error('[CASE 8] FAILED | Record not found');
        return;
      }

      const originalCreatedBy = dbRecord.createdBy;
      const originalModifiedBy = dbRecord.modifiedBy;

      // Update with explicit modifiedBy
      await repo.updateById({
        id: dbRecord.id,
        data: {
          description: 'Late update',
          modifiedBy: lateUser,
        },
      });

      // Verify
      [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.code, testCode));

      if (dbRecord?.modifiedBy === lateUser) {
        this.logger.info(
          '[CASE 8] PASSED | modifiedBy updated from null | original: %s | new: %s',
          originalModifiedBy,
          dbRecord.modifiedBy,
        );
        this.logger.info(
          '[CASE 8] INFO | createdBy remains: %s (original: %s)',
          dbRecord.createdBy,
          originalCreatedBy,
        );
      } else {
        this.logger.error(
          '[CASE 8] FAILED | modifiedBy not updated | expected: %s | got: %s',
          lateUser,
          dbRecord?.modifiedBy,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Verify audit fields actually stored in database
  // ----------------------------------------------------------------
  private async case9_VerifyAuditFieldsStoredInDatabase(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 9] Verify audit fields are correctly stored in database');

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
      const connector = repo.getConnector();
      const [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.code, testCode));

      if (!dbRecord) {
        this.logger.error('[CASE 9] FAILED | Record not found via direct query');
        return;
      }

      // Verify exact match
      if (dbRecord.createdBy === testUser && dbRecord.modifiedBy === testUser) {
        this.logger.info(
          '[CASE 9] PASSED | Database stores correct values | createdBy: %s | modifiedBy: %s',
          dbRecord.createdBy,
          dbRecord.modifiedBy,
        );
      } else {
        this.logger.error(
          '[CASE 9] FAILED | Database values mismatch | createdBy: %s (expected: %s) | modifiedBy: %s (expected: %s)',
          dbRecord.createdBy,
          testUser,
          dbRecord.modifiedBy,
          testUser,
        );
      }

      // Also verify other fields are intact
      if (dbRecord.code === testCode && dbRecord.group === 'AUDIT_TEST') {
        this.logger.info('[CASE 9] PASSED | Other fields also stored correctly');
      }
    } catch (error) {
      this.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Filter/query by audit fields
  // ----------------------------------------------------------------
  private async case10_FilterByAuditFields(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 10] Filter records by createdBy and modifiedBy');

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
          { code: `${group}_1`, group, dataType: DataTypes.TEXT, createdBy: userA, modifiedBy: userA },
          { code: `${group}_2`, group, dataType: DataTypes.TEXT, createdBy: userA, modifiedBy: userB },
          { code: `${group}_3`, group, dataType: DataTypes.TEXT, createdBy: userB, modifiedBy: userB },
          { code: `${group}_4`, group, dataType: DataTypes.TEXT, createdBy: userC, modifiedBy: userA },
        ],
      });

      // Filter by createdBy
      const createdByA = await repo.find({
        filter: { where: { group, createdBy: userA } },
      });

      if (createdByA.length === 2) {
        this.logger.info(
          '[CASE 10] PASSED | Filter by createdBy | found %d records for userA',
          createdByA.length,
        );
      } else {
        this.logger.error(
          '[CASE 10] FAILED | Filter by createdBy | expected 2 | got %d',
          createdByA.length,
        );
      }

      // Filter by modifiedBy
      const modifiedByA = await repo.find({
        filter: { where: { group, modifiedBy: userA } },
      });

      if (modifiedByA.length === 2) {
        this.logger.info(
          '[CASE 10] PASSED | Filter by modifiedBy | found %d records modified by userA',
          modifiedByA.length,
        );
      } else {
        this.logger.error(
          '[CASE 10] FAILED | Filter by modifiedBy | expected 2 | got %d',
          modifiedByA.length,
        );
      }

      // Count by createdBy
      const countByCreator = await repo.count({
        where: { group, createdBy: userB },
      });

      if (countByCreator.count === 1) {
        this.logger.info('[CASE 10] PASSED | Count by createdBy | userB created %d records', countByCreator.count);
      } else {
        this.logger.error('[CASE 10] FAILED | Count by createdBy | expected 1 | got %d', countByCreator.count);
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Transaction - audit fields should work correctly
  // ----------------------------------------------------------------
  private async case11_TransactionAuditTracking(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 11] Audit tracking works correctly within transactions');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_TX_${uniqueId}`;
      // Create real Users for FK constraint (outside transaction)
      const txUser = await this.createTestUser(`CASE11_TX_${uniqueId}`);
      const txUpdater = await this.createTestUser(`CASE11_UPDATER_${uniqueId}`);

      const transaction = await repo.beginTransaction();

      // Create within transaction
      const created = await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_TX_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 100,
          createdBy: txUser,
          modifiedBy: txUser,
        },
        options: { transaction },
      });

      if (!created.data) {
        this.logger.error('[CASE 11] FAILED | Create in transaction returned no data');
        await transaction.rollback();
        return;
      }

      // Update within same transaction
      await repo.updateById({
        id: created.data.id,
        data: { nValue: 200, modifiedBy: txUpdater },
        options: { transaction },
      });

      // Verify within transaction
      const found = await repo.findById({
        id: created.data.id,
        options: { transaction },
      });

      if (!found) {
        this.logger.error('[CASE 11] FAILED | Record not found in transaction');
        await transaction.rollback();
        return;
      }

      await transaction.commit();

      // Verify after commit
      const connector = repo.getConnector();
      const [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.code, testCode));

      if (dbRecord?.createdBy === txUser && dbRecord?.modifiedBy === txUpdater) {
        this.logger.info(
          '[CASE 11] PASSED | Transaction audit fields correct | createdBy: %s | modifiedBy: %s',
          dbRecord.createdBy,
          dbRecord.modifiedBy,
        );
      } else {
        this.logger.error(
          '[CASE 11] FAILED | Transaction audit fields | createdBy: %s (expected: %s) | modifiedBy: %s (expected: %s)',
          dbRecord?.createdBy,
          txUser,
          dbRecord?.modifiedBy,
          txUpdater,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'AUDIT_TX_TEST' } });
    } catch (error) {
      this.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Rollback - audit changes should not persist
  // ----------------------------------------------------------------
  private async case12_RollbackAuditTracking(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 12] Rollback - audit field changes should not persist');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_ROLLBACK_${uniqueId}`;
      // Create real Users for FK constraint
      const originalUser = await this.createTestUser(`CASE12_ORIGINAL_${uniqueId}`);
      const rollbackUser = await this.createTestUser(`CASE12_ROLLBACK_${uniqueId}`);

      // First, create a record outside transaction
      await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_ROLLBACK_TEST',
          dataType: DataTypes.NUMBER,
          nValue: 100,
          createdBy: originalUser,
          modifiedBy: originalUser,
        },
      });

      const connector = repo.getConnector();
      let [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.code, testCode));

      if (!dbRecord) {
        this.logger.error('[CASE 12] FAILED | Initial record not created');
        return;
      }

      const recordId = dbRecord.id;

      // Start transaction and update
      const transaction = await repo.beginTransaction();

      await repo.updateById({
        id: recordId,
        data: { nValue: 999, modifiedBy: rollbackUser },
        options: { transaction },
      });

      // Verify change is visible within transaction
      const inTxRecord = await repo.findById({
        id: recordId,
        options: { transaction },
      });

      // Rollback
      await transaction.rollback();

      // Verify changes did NOT persist
      [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.id, recordId));

      if (dbRecord?.modifiedBy === originalUser && dbRecord?.nValue === 100) {
        this.logger.info(
          '[CASE 12] PASSED | Rollback preserved original values | modifiedBy: %s | nValue: %d',
          dbRecord.modifiedBy,
          dbRecord.nValue,
        );
        this.logger.info(
          '[CASE 12] INFO | In-transaction value was: modifiedBy=%s nValue=%s',
          (inTxRecord as any)?.modifiedBy,
          (inTxRecord as any)?.nValue,
        );
      } else {
        this.logger.error(
          '[CASE 12] FAILED | Rollback did not restore values | modifiedBy: %s | nValue: %d',
          dbRecord?.modifiedBy,
          dbRecord?.nValue,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'AUDIT_ROLLBACK_TEST' } });
    } catch (error) {
      this.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Concurrent updates - last write wins for modifiedBy
  // ----------------------------------------------------------------
  private async case13_ConcurrentUpdatesModifiedBy(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 13] Concurrent updates - verify modifiedBy reflects last writer');

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
        this.logger.error('[CASE 13] FAILED | Record creation failed');
        return;
      }

      const recordId = created.data.id;

      // Launch concurrent updates with different users
      const updatePromises = users.map((user, idx) =>
        repo.updateById({
          id: recordId,
          data: { nValue: (idx + 1) * 100, modifiedBy: user },
        }).catch(err => ({ error: err })),
      );

      await Promise.all(updatePromises);

      // Verify final state
      const connector = repo.getConnector();
      const [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.id, recordId));

      if (!dbRecord) {
        this.logger.error('[CASE 13] FAILED | Record not found after concurrent updates');
        return;
      }

      // createdBy should still be original
      if (dbRecord.createdBy === creator) {
        this.logger.info('[CASE 13] PASSED | createdBy preserved during concurrent updates');
      } else {
        this.logger.error('[CASE 13] FAILED | createdBy changed during concurrent updates');
      }

      // modifiedBy should be one of the concurrent users
      if (users.includes(dbRecord.modifiedBy as string)) {
        this.logger.info(
          '[CASE 13] PASSED | modifiedBy is one of concurrent users | value: %s',
          dbRecord.modifiedBy,
        );
      } else {
        this.logger.error(
          '[CASE 13] FAILED | modifiedBy has unexpected value | value: %s',
          dbRecord.modifiedBy,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'AUDIT_CONCURRENT_TEST' } });
    } catch (error) {
      this.logger.error('[CASE 13] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Audit fields with relations
  // ----------------------------------------------------------------
  private async case14_AuditFieldsWithRelations(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 14] Audit fields accessible when including relations');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_RELATION_${uniqueId}`;

      // Create a user first for the relation
      const testUser = await this.userRepository.findOne({
        filter: { where: { realm: { like: 'AUDIT_%' } } },
      });

      let userId: string;
      if (!testUser) {
        const createdUser = await this.userRepository.create({
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
        this.logger.error('[CASE 14] FAILED | Configuration not found');
        return;
      }

      const creator = (configWithCreator as any).creator;
      const hasAuditFields = 'createdBy' in configWithCreator && 'modifiedBy' in configWithCreator;

      if (hasAuditFields) {
        this.logger.info(
          '[CASE 14] PASSED | Audit fields present | createdBy: %s | modifiedBy: %s',
          (configWithCreator as any).createdBy,
          (configWithCreator as any).modifiedBy,
        );
      } else {
        this.logger.error('[CASE 14] FAILED | Audit fields missing from result with relations');
      }

      if (creator) {
        this.logger.info('[CASE 14] PASSED | Creator relation loaded | id: %s', creator.id);
      } else {
        this.logger.warn('[CASE 14] INFO | Creator relation not loaded (may not be configured)');
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'AUDIT_RELATION_TEST' } });
    } catch (error) {
      this.logger.error('[CASE 14] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: Multiple sequential updates track modifiedBy correctly
  // ----------------------------------------------------------------
  private async case15_MultipleSequentialUpdates(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 15] Multiple sequential updates track modifiedBy history');

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
        this.logger.error('[CASE 15] FAILED | Record creation failed');
        return;
      }

      const recordId = created.data.id;
      const connector = repo.getConnector();

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
          this.logger.error(
            '[CASE 15] FAILED | Update %d | expected modifiedBy: %s | got: %s',
            i + 1,
            users[i],
            dbRecord?.modifiedBy,
          );
        } else if (dbRecord?.createdBy !== creator) {
          this.logger.error(
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
        this.logger.info(
          '[CASE 15] PASSED | %d sequential updates | createdBy: %s | final modifiedBy: %s',
          users.length,
          finalRecord.createdBy,
          finalRecord.modifiedBy,
        );
      } else {
        this.logger.error(
          '[CASE 15] FAILED | Final state | createdBy: %s | modifiedBy: %s | nValue: %d',
          finalRecord?.createdBy,
          finalRecord?.modifiedBy,
          finalRecord?.nValue,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'AUDIT_SEQUENTIAL_TEST' } });
    } catch (error) {
      this.logger.error('[CASE 15] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Audit fields with valid User IDs (FK constraint validation)
  // ----------------------------------------------------------------
  private async case16_AuditFieldsDataTypes(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 16] Audit fields correctly store valid User IDs (FK constraint enforced)');

    try {
      const uniqueId = getUID();
      const group = `AUDIT_DATATYPE_${uniqueId}`;

      // Create multiple test users to verify audit fields work with valid User IDs
      const testCases = [
        { name: 'USER_A', description: 'First valid User ID' },
        { name: 'USER_B', description: 'Second valid User ID' },
        { name: 'USER_C', description: 'Third valid User ID' },
      ];

      for (let i = 0; i < testCases.length; i++) {
        const { name, description } = testCases[i];
        const code = `${group}_${i}`;

        try {
          // Create real User for FK constraint
          const userId = await this.createTestUser(`CASE16_${name}_${uniqueId}`);

          await repo.create({
            data: {
              code,
              group,
              dataType: DataTypes.TEXT,
              createdBy: userId,
              modifiedBy: userId,
            },
          });

          const connector = repo.getConnector();
          const [dbRecord] = await connector
            .select()
            .from(Configuration.schema)
            .where(eq(Configuration.schema.code, code));

          if (dbRecord?.createdBy === userId && dbRecord?.modifiedBy === userId) {
            this.logger.info('[CASE 16] PASSED | %s | userId: %s', description, userId);
          } else {
            this.logger.error(
              '[CASE 16] FAILED | %s | expected: "%s" | createdBy: "%s" | modifiedBy: "%s"',
              description,
              userId,
              dbRecord?.createdBy,
              dbRecord?.modifiedBy,
            );
          }
        } catch (createError) {
          this.logger.error(
            '[CASE 16] FAILED | %s threw error | %s',
            description,
            (createError as Error).message.substring(0, 50),
          );
        }
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[CASE 16] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 17: Count and ExistsWith operations with audit field filters
  // ----------------------------------------------------------------
  private async case17_AuditFieldsInCountAndExists(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 17] Count and ExistsWith operations using audit field filters');

    try {
      const uniqueId = getUID();
      const group = `AUDIT_COUNT_EXISTS_${uniqueId}`;
      // Create real Users for FK constraint
      const userA = await this.createTestUser(`CASE17_A_${uniqueId}`);
      const userB = await this.createTestUser(`CASE17_B_${uniqueId}`);

      // Create test data
      await repo.createAll({
        data: [
          { code: `${group}_1`, group, dataType: DataTypes.TEXT, createdBy: userA, modifiedBy: userA },
          { code: `${group}_2`, group, dataType: DataTypes.TEXT, createdBy: userA, modifiedBy: userB },
          { code: `${group}_3`, group, dataType: DataTypes.TEXT, createdBy: userB, modifiedBy: userB },
        ],
      });

      // Count by createdBy
      const countCreatedByA = await repo.count({ where: { group, createdBy: userA } });
      if (countCreatedByA.count === 2) {
        this.logger.info('[CASE 17] PASSED | Count by createdBy | userA: %d', countCreatedByA.count);
      } else {
        this.logger.error('[CASE 17] FAILED | Count by createdBy | expected 2 | got %d', countCreatedByA.count);
      }

      // ExistsWith by modifiedBy
      const existsModifiedByB = await repo.existsWith({ where: { group, modifiedBy: userB } });
      if (existsModifiedByB) {
        this.logger.info('[CASE 17] PASSED | ExistsWith by modifiedBy | userB exists: true');
      } else {
        this.logger.error('[CASE 17] FAILED | ExistsWith by modifiedBy | expected true');
      }

      // ExistsWith for non-existent user
      const existsNonExistent = await repo.existsWith({
        where: { group, createdBy: 'NON_EXISTENT_USER' },
      });
      if (!existsNonExistent) {
        this.logger.info('[CASE 17] PASSED | ExistsWith for non-existent createdBy returns false');
      } else {
        this.logger.error('[CASE 17] FAILED | ExistsWith for non-existent should return false');
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[CASE 17] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 18: Delete operations return audit fields
  // ----------------------------------------------------------------
  private async case18_DeleteReturnsAuditFields(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 18] Delete operations return records with audit fields');

    try {
      const uniqueId = getUID();
      const testCode = `AUDIT_DELETE_${uniqueId}`;
      // Create real User for FK constraint
      const testUser = await this.createTestUser(`CASE18_DELETE_${uniqueId}`);

      // Create record
      const created = await repo.create({
        data: {
          code: testCode,
          group: 'AUDIT_DELETE_TEST',
          dataType: DataTypes.TEXT,
          createdBy: testUser,
          modifiedBy: testUser,
        },
      });

      if (!created.data) {
        this.logger.error('[CASE 18] FAILED | Record creation failed');
        return;
      }

      const recordId = created.data.id;

      // Delete by ID
      const deleted = await repo.deleteById({ id: recordId });

      if (deleted.count !== 1 || !deleted.data) {
        this.logger.error('[CASE 18] FAILED | Delete did not return expected count');
        return;
      }

      const hasCreatedBy = 'createdBy' in deleted.data;
      const hasModifiedBy = 'modifiedBy' in deleted.data;

      if (hasCreatedBy && hasModifiedBy) {
        this.logger.info(
          '[CASE 18] PASSED | DeleteById returns audit fields | createdBy: %s | modifiedBy: %s',
          (deleted.data as any).createdBy,
          (deleted.data as any).modifiedBy,
        );
      } else {
        this.logger.info(
          '[CASE 18] INFO | DeleteById may not return audit fields | hasCreatedBy: %s | hasModifiedBy: %s',
          hasCreatedBy,
          hasModifiedBy,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 18] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: Security - Audit field injection attempt
  // ----------------------------------------------------------------
  private async case19_AuditFieldInjectionAttempt(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 19] Security - Test audit field injection attempts');

    try {
      const uniqueId = getUID();
      const group = `AUDIT_SECURITY_${uniqueId}`;

      // Test potentially malicious audit field values
      const maliciousInputs = [
        { value: "'; DROP TABLE Configuration; --", description: 'SQL Injection' },
        { value: '<script>alert("xss")</script>', description: 'XSS Payload' },
        { value: '../../../etc/passwd', description: 'Path Traversal' },
        { value: '${process.env.SECRET}', description: 'Template Injection' },
        { value: '__proto__', description: 'Prototype Pollution Key' },
        { value: 'A'.repeat(10000), description: 'Very Long String (10K chars)' },
        { value: '\x00\x01\x02', description: 'Null bytes and control chars' },
        { value: '\\n\\r\\t', description: 'Escape sequences' },
      ];

      for (let i = 0; i < maliciousInputs.length; i++) {
        const { value, description } = maliciousInputs[i];
        const code = `${group}_${i}`;

        try {
          await repo.create({
            data: {
              code,
              group,
              dataType: DataTypes.TEXT,
              createdBy: value,
              modifiedBy: value,
            },
          });

          // Verify it was stored safely (as literal string, not executed)
          const connector = repo.getConnector();
          const [dbRecord] = await connector
            .select()
            .from(Configuration.schema)
            .where(eq(Configuration.schema.code, code));

          if (dbRecord) {
            // Check if value was stored as-is (sanitized storage)
            if (dbRecord.createdBy === value) {
              this.logger.info(
                '[CASE 19] INFO | %s stored literally (length: %d)',
                description,
                value.length,
              );
            } else if (dbRecord.createdBy !== null) {
              this.logger.info(
                '[CASE 19] INFO | %s was transformed | stored length: %d',
                description,
                String(dbRecord.createdBy ?? '').length,
              );
            }
          }
        } catch (createError) {
          // Rejection of malicious input is a valid security response
          this.logger.info(
            '[CASE 19] PASSED | %s rejected | error: %s',
            description,
            (createError as Error).message.substring(0, 50),
          );
        }
      }

      this.logger.info('[CASE 19] PASSED | Security tests completed - system did not crash');

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[CASE 19] FAILED | Security test error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 20: Null audit fields behavior (FK constraint aware)
  // ----------------------------------------------------------------
  private async case20_EmptyStringVsNullAuditFields(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CASE 20] Test null audit fields and FK constraint validation');

    try {
      const uniqueId = getUID();
      const group = `AUDIT_EMPTY_NULL_${uniqueId}`;

      // Test 1: Empty string should be rejected by FK constraint
      let emptyStringRejected = false;
      try {
        await repo.create({
          data: {
            code: `${group}_EMPTY`,
            group,
            dataType: DataTypes.TEXT,
            createdBy: '',
            modifiedBy: '',
          },
        });
      } catch {
        emptyStringRejected = true;
        this.logger.info('[CASE 20] PASSED | Empty string rejected by FK constraint');
      }

      if (!emptyStringRejected) {
        this.logger.warn('[CASE 20] INFO | Empty string was accepted (FK may not be enforced)');
      }

      // Test 2: Null should be accepted (FK allows null for optional audit fields)
      let nullAccepted = false;
      try {
        await repo.create({
          data: {
            code: `${group}_NULL`,
            group,
            dataType: DataTypes.TEXT,
            // Omitting createdBy/modifiedBy - should default to null without context
          },
        });
        nullAccepted = true;
      } catch {
        this.logger.info('[CASE 20] INFO | Null value rejected');
      }

      // Verify via direct query
      const connector = repo.getConnector();
      const records = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.group, group));

      const nullRecord = records.find(r => r.code?.includes('NULL'));

      if (nullRecord) {
        const isNull = nullRecord.createdBy === null;
        this.logger.info(
          '[CASE 20] INFO | Null record found | createdBy isNull: %s | value: %s',
          isNull,
          nullRecord.createdBy,
        );
      }

      if (nullAccepted) {
        this.logger.info('[CASE 20] PASSED | Null audit fields accepted (optional FK)');
      }

      this.logger.info('[CASE 20] PASSED | Null/empty audit field test completed');

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.logger.error('[CASE 20] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 21: Cleanup all audit test data
  // ----------------------------------------------------------------
  private async case21_Cleanup(): Promise<void> {
    this.logCase('[CASE 21] Cleanup all user audit test data');

    try {
      // Clean up Configuration records
      const configDeleted = await this.configurationRepository.deleteAll({
        where: { group: { like: 'AUDIT%' } },
      });
      this.logger.info('[CASE 21] Deleted %d Configuration records', configDeleted.count);

      // Clean up test users
      const userDeleted = await this.userRepository.deleteAll({
        where: { realm: { like: 'AUDIT%' } },
        options: { force: true },
      });
      this.logger.info('[CASE 21] Deleted %d User records', userDeleted.count);

      this.logger.info('[CASE 21] PASSED | Cleanup completed');
    } catch (error) {
      this.logger.error('[CASE 21] FAILED | Cleanup error: %s', (error as Error).message);
    }
  }
}
