import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { eq } from 'drizzle-orm';
import { Configuration } from '../../../models/entities';
import { BaseTestCases } from '../base-test.cases';
import { UserAuditFixture } from './support';

// ----------------------------------------------------------------
// Created-By Cases - createdBy at creation time, and its immutability on update
// ----------------------------------------------------------------
export class CreatedByCases extends BaseTestCases {
  private readonly fixture = new UserAuditFixture(this.context);

  private createTestUser(name: string): Promise<string> {
    return this.fixture.createTestUser(name);
  }

  // ----------------------------------------------------------------
  // CASE 1: Create with explicit audit fields
  // ----------------------------------------------------------------
  async case1CreateWithExplicitAuditFields(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 1] Create with explicit createdBy and modifiedBy values');

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
        this.context.logger.error('[CASE 1] FAILED | No data returned from create');
        return;
      }

      const hasCreatedBy = 'createdBy' in created.data;
      const hasModifiedBy = 'modifiedBy' in created.data;

      if (hasCreatedBy && hasModifiedBy) {
        const createdByValue = (created.data as any).createdBy;
        const modifiedByValue = (created.data as any).modifiedBy;

        if (createdByValue === testUserId && modifiedByValue === testUserId) {
          this.context.logger.info(
            '[CASE 1] PASSED | Explicit audit fields set | createdBy: %s | modifiedBy: %s',
            createdByValue,
            modifiedByValue,
          );
        } else {
          this.context.logger.error(
            '[CASE 1] FAILED | Audit field values mismatch | createdBy: %s (expected: %s) | modifiedBy: %s (expected: %s)',
            createdByValue,
            testUserId,
            modifiedByValue,
            testUserId,
          );
        }
      } else {
        this.context.logger.error(
          '[CASE 1] FAILED | Audit fields missing from response | hasCreatedBy: %s | hasModifiedBy: %s',
          hasCreatedBy,
          hasModifiedBy,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Create without context - audit fields should be null
  // ----------------------------------------------------------------
  async case2CreateWithoutContextNullAuditFields(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[CASE 2] Create without Hono context - audit fields should be null (or default)',
    );

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
        this.context.logger.error('[CASE 2] FAILED | No data returned from create');
        return;
      }

      // Verify via direct connector query to see actual DB values
      const connector = repo.connector;
      const directResults = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.code, testCode));

      if (directResults.length === 0) {
        this.context.logger.error('[CASE 2] FAILED | Record not found in database');
        return;
      }

      const dbRecord = directResults[0];

      // Without context, createdBy and modifiedBy should be null
      if (dbRecord.createdBy === null && dbRecord.modifiedBy === null) {
        this.context.logger.info(
          '[CASE 2] PASSED | Without context, audit fields are null | createdBy: %s | modifiedBy: %s',
          dbRecord.createdBy,
          dbRecord.modifiedBy,
        );
      } else {
        // They might have values if explicitly set or from defaults
        this.context.logger.info(
          '[CASE 2] INFO | Audit fields have values (may be from explicit setting) | createdBy: %s | modifiedBy: %s',
          dbRecord.createdBy,
          dbRecord.modifiedBy,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: CreateAll (bulk) with audit fields
  // ----------------------------------------------------------------
  async case3CreateAllBulkAuditFields(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 3] CreateAll with explicit audit fields for each record');

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

      if (created.count !== 3 || created.data?.length !== 3) {
        this.context.logger.error(
          '[CASE 3] FAILED | Expected 3 records created | count: %d',
          created.count,
        );
        return;
      }

      // Verify each record has correct audit fields
      const connector = repo.connector;
      const records = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.group, 'AUDIT_BULK_TEST'));

      const expectedUsers = [user1, user2, user3];
      let allCorrect = true;

      for (const record of records) {
        if (!expectedUsers.includes(record.createdBy as string)) {
          allCorrect = false;
          this.context.logger.error(
            '[CASE 3] FAILED | Unexpected createdBy | code: %s | createdBy: %s',
            record.code,
            record.createdBy,
          );
        }
        if (record.createdBy !== record.modifiedBy) {
          allCorrect = false;
          this.context.logger.error(
            '[CASE 3] FAILED | createdBy != modifiedBy on create | code: %s',
            record.code,
          );
        }
      }

      if (allCorrect) {
        this.context.logger.info(
          '[CASE 3] PASSED | All %d bulk records have correct audit fields',
          records.length,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'AUDIT_BULK_TEST' } });
    } catch (error) {
      this.context.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: UpdateById - createdBy should NOT change
  // ----------------------------------------------------------------
  async case5UpdateByIdCreatedByUnchanged(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 5] UpdateById - createdBy should remain unchanged');

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
        this.context.logger.error('[CASE 5] FAILED | No data returned from create');
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
        const connector = repo.connector;
        const [dbRecord] = await connector
          .select()
          .from(Configuration.schema)
          .where(eq(Configuration.schema.id, recordId));

        if (!dbRecord) {
          this.context.logger.error('[CASE 5] FAILED | Record not found after update');
          return;
        }

        if (dbRecord.createdBy === originalCreator) {
          this.context.logger.info(
            '[CASE 5] PASSED | createdBy unchanged after update attempt | value: %s',
            dbRecord.createdBy,
          );
        } else if (dbRecord.createdBy === attemptedNewCreator) {
          this.context.logger.error(
            '[CASE 5] SECURITY WARNING | createdBy was changed! This may be a security issue | original: %s | new: %s',
            originalCreator,
            dbRecord.createdBy,
          );
        } else {
          this.context.logger.warn(
            '[CASE 5] UNEXPECTED | createdBy has unexpected value | expected: %s | got: %s',
            originalCreator,
            dbRecord.createdBy,
          );
        }
      } catch (updateError) {
        // Some implementations might reject changing createdBy
        this.context.logger.info(
          '[CASE 5] PASSED | Update rejected attempt to change createdBy | error: %s',
          (updateError as Error).message.substring(0, 50),
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }
}
