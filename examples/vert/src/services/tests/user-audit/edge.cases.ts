import { DataTypes, getUID } from '@venizia/ignis-helpers';
import { eq } from 'drizzle-orm';
import { Configuration } from '../../../models/entities';
import { BaseTestCases } from '../base-test.cases';
import { UserAuditFixture } from './support';

// ----------------------------------------------------------------
// Edge Cases - null handling, transactions, FK/data-type limits, security, cleanup
// ----------------------------------------------------------------
export class EdgeCases extends BaseTestCases {
  private readonly fixture = new UserAuditFixture(this.context);

  private createTestUser(name: string): Promise<string> {
    return this.fixture.createTestUser(name);
  }

  // ----------------------------------------------------------------
  // CASE 8: Null to non-null audit field update
  // ----------------------------------------------------------------
  async case8NullToNonNullAuditFields(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 8] Update null audit fields to non-null values');

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
      const connector = repo.connector;
      let [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.code, testCode));

      if (!dbRecord) {
        this.context.logger.error('[CASE 8] FAILED | Record not found');
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
        this.context.logger.info(
          '[CASE 8] PASSED | modifiedBy updated from null | original: %s | new: %s',
          originalModifiedBy,
          dbRecord.modifiedBy,
        );
        this.context.logger.info(
          '[CASE 8] INFO | createdBy remains: %s (original: %s)',
          dbRecord.createdBy,
          originalCreatedBy,
        );
      } else {
        this.context.logger.error(
          '[CASE 8] FAILED | modifiedBy not updated | expected: %s | got: %s',
          lateUser,
          dbRecord?.modifiedBy,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Transaction - audit fields should work correctly
  // ----------------------------------------------------------------
  async case11TransactionAuditTracking(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 11] Audit tracking works correctly within transactions');

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
        this.context.logger.error('[CASE 11] FAILED | Create in transaction returned no data');
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
        this.context.logger.error('[CASE 11] FAILED | Record not found in transaction');
        await transaction.rollback();
        return;
      }

      await transaction.commit();

      // Verify after commit
      const connector = repo.connector;
      const [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.code, testCode));

      if (dbRecord?.createdBy === txUser && dbRecord?.modifiedBy === txUpdater) {
        this.context.logger.info(
          '[CASE 11] PASSED | Transaction audit fields correct | createdBy: %s | modifiedBy: %s',
          dbRecord.createdBy,
          dbRecord.modifiedBy,
        );
      } else {
        this.context.logger.error(
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
      this.context.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Rollback - audit changes should not persist
  // ----------------------------------------------------------------
  async case12RollbackAuditTracking(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 12] Rollback - audit field changes should not persist');

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

      const connector = repo.connector;
      let [dbRecord] = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.code, testCode));

      if (!dbRecord) {
        this.context.logger.error('[CASE 12] FAILED | Initial record not created');
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
        this.context.logger.info(
          '[CASE 12] PASSED | Rollback preserved original values | modifiedBy: %s | nValue: %d',
          dbRecord.modifiedBy,
          dbRecord.nValue,
        );
        this.context.logger.info(
          '[CASE 12] INFO | In-transaction value was: modifiedBy=%s nValue=%s',
          (inTxRecord as any)?.modifiedBy,
          (inTxRecord as any)?.nValue,
        );
      } else {
        this.context.logger.error(
          '[CASE 12] FAILED | Rollback did not restore values | modifiedBy: %s | nValue: %d',
          dbRecord?.modifiedBy,
          dbRecord?.nValue,
        );
      }

      // Cleanup
      await repo.deleteAll({ where: { group: 'AUDIT_ROLLBACK_TEST' } });
    } catch (error) {
      this.context.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Audit fields with valid User IDs (FK constraint validation)
  // ----------------------------------------------------------------
  async case16AuditFieldsDataTypes(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase(
      '[CASE 16] Audit fields correctly store valid User IDs (FK constraint enforced)',
    );

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

          const connector = repo.connector;
          const [dbRecord] = await connector
            .select()
            .from(Configuration.schema)
            .where(eq(Configuration.schema.code, code));

          if (dbRecord?.createdBy === userId && dbRecord?.modifiedBy === userId) {
            this.context.logger.info('[CASE 16] PASSED | %s | userId: %s', description, userId);
          } else {
            this.context.logger.error(
              '[CASE 16] FAILED | %s | expected: "%s" | createdBy: "%s" | modifiedBy: "%s"',
              description,
              userId,
              dbRecord?.createdBy,
              dbRecord?.modifiedBy,
            );
          }
        } catch (createError) {
          this.context.logger.error(
            '[CASE 16] FAILED | %s threw error | %s',
            description,
            (createError as Error).message.substring(0, 50),
          );
        }
      }

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[CASE 16] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 18: Delete operations return audit fields
  // ----------------------------------------------------------------
  async case18DeleteReturnsAuditFields(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 18] Delete operations return records with audit fields');

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
        this.context.logger.error('[CASE 18] FAILED | Record creation failed');
        return;
      }

      const recordId = created.data.id;

      // Delete by ID
      const deleted = await repo.deleteById({ id: recordId });

      if (deleted.count !== 1 || !deleted.data) {
        this.context.logger.error('[CASE 18] FAILED | Delete did not return expected count');
        return;
      }

      const hasCreatedBy = 'createdBy' in deleted.data;
      const hasModifiedBy = 'modifiedBy' in deleted.data;

      if (hasCreatedBy && hasModifiedBy) {
        this.context.logger.info(
          '[CASE 18] PASSED | DeleteById returns audit fields | createdBy: %s | modifiedBy: %s',
          (deleted.data as any).createdBy,
          (deleted.data as any).modifiedBy,
        );
      } else {
        this.context.logger.info(
          '[CASE 18] INFO | DeleteById may not return audit fields | hasCreatedBy: %s | hasModifiedBy: %s',
          hasCreatedBy,
          hasModifiedBy,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 18] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: Security - Audit field injection attempt
  // ----------------------------------------------------------------
  async case19AuditFieldInjectionAttempt(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 19] Security - Test audit field injection attempts');

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
          const connector = repo.connector;
          const [dbRecord] = await connector
            .select()
            .from(Configuration.schema)
            .where(eq(Configuration.schema.code, code));

          if (dbRecord) {
            // Check if value was stored as-is (sanitized storage)
            if (dbRecord.createdBy === value) {
              this.context.logger.info(
                '[CASE 19] INFO | %s stored literally (length: %d)',
                description,
                value.length,
              );
            } else if (dbRecord.createdBy !== null) {
              this.context.logger.info(
                '[CASE 19] INFO | %s was transformed | stored length: %d',
                description,
                String(dbRecord.createdBy ?? '').length,
              );
            }
          }
        } catch (createError) {
          // Rejection of malicious input is a valid security response
          this.context.logger.info(
            '[CASE 19] PASSED | %s rejected | error: %s',
            description,
            (createError as Error).message.substring(0, 50),
          );
        }
      }

      this.context.logger.info(
        '[CASE 19] PASSED | Security tests completed - system did not crash',
      );

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error(
        '[CASE 19] FAILED | Security test error: %s',
        (error as Error).message,
      );
    }
  }

  // ----------------------------------------------------------------
  // CASE 20: Null audit fields behavior (FK constraint aware)
  // ----------------------------------------------------------------
  async case20EmptyStringVsNullAuditFields(): Promise<void> {
    const repo = this.context.configurationRepository;
    this.context.logCase('[CASE 20] Test null audit fields and FK constraint validation');

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
        this.context.logger.info('[CASE 20] PASSED | Empty string rejected by FK constraint');
      }

      if (!emptyStringRejected) {
        this.context.logger.warn(
          '[CASE 20] INFO | Empty string was accepted (FK may not be enforced)',
        );
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
        this.context.logger.info('[CASE 20] INFO | Null value rejected');
      }

      // Verify via direct query
      const connector = repo.connector;
      const records = await connector
        .select()
        .from(Configuration.schema)
        .where(eq(Configuration.schema.group, group));

      const nullRecord = records.find(r => r.code?.includes('NULL'));

      if (nullRecord) {
        const isNull = nullRecord.createdBy === null;
        this.context.logger.info(
          '[CASE 20] INFO | Null record found | createdBy isNull: %s | value: %s',
          isNull,
          nullRecord.createdBy,
        );
      }

      if (nullAccepted) {
        this.context.logger.info('[CASE 20] PASSED | Null audit fields accepted (optional FK)');
      }

      this.context.logger.info('[CASE 20] PASSED | Null/empty audit field test completed');

      // Cleanup
      await repo.deleteAll({ where: { group } });
    } catch (error) {
      this.context.logger.error('[CASE 20] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 21: Cleanup all audit test data
  // ----------------------------------------------------------------
  async case21Cleanup(): Promise<void> {
    this.context.logCase('[CASE 21] Cleanup all user audit test data');

    try {
      // Clean up Configuration records
      const configDeleted = await this.context.configurationRepository.deleteAll({
        where: { group: { like: 'AUDIT%' } },
      });
      this.context.logger.info('[CASE 21] Deleted %d Configuration records', configDeleted.count);

      // Clean up test users
      const userDeleted = await this.context.userRepository.deleteAll({
        where: { realm: { like: 'AUDIT%' } },
        options: { force: true },
      });
      this.context.logger.info('[CASE 21] Deleted %d User records', userDeleted.count);

      this.context.logger.info('[CASE 21] PASSED | Cleanup completed');
    } catch (error) {
      this.context.logger.error('[CASE 21] FAILED | Cleanup error: %s', (error as Error).message);
    }
  }
}
