import { getUID } from '@venizia/ignis-helpers';
import { eq, like } from 'drizzle-orm';
import { User } from '../../../models/entities';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Edge Cases - connector bypass, transactions, boundary values, cleanup
// ----------------------------------------------------------------
export class EdgeCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 6: Cleanup test data (runs last in test sequence)
  // ----------------------------------------------------------------
  async case6Cleanup(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CLEANUP] Cleanup hidden properties test data');

    try {
      const deleted = await repo.deleteAll({
        where: { realm: { like: 'HIDDEN_TEST_%' } },
      });

      if (deleted.data && deleted.data.length > 0) {
        const firstDeleted = deleted.data[0];
        const hasPassword = 'password' in firstDeleted;
        const hasSecret = 'secret' in firstDeleted;

        if (hasPassword || hasSecret) {
          this.context.logger.error(
            '[CASE 6] Note: Hidden fields found in delete response | hasPassword: %s | hasSecret: %s',
            hasPassword,
            hasSecret,
          );
        }
      }

      this.context.logger.info('[CASE 6] PASSED | Deleted %d test users', deleted.count);
    } catch (error) {
      this.context.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Connector query SHOULD return hidden properties (bypass repository)
  // ----------------------------------------------------------------
  async case7ConnectorQueryReturnsHidden(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 7] Connector query SHOULD return hidden properties');

    try {
      const repoUser = await repo.findOne({
        filter: { where: { realm: { like: 'HIDDEN_TEST_%' } } },
      });

      if (!repoUser) {
        this.context.logger.warn('[CASE 7] SKIPPED | No test user found');
        return;
      }

      const connector = repo.connector;
      const directResults = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, repoUser.id));

      if (directResults.length === 0) {
        this.context.logger.error('[CASE 7] FAILED | Direct query returned no results');
        return;
      }

      const directUser = directResults[0];
      const directKeys = Object.keys(directUser);
      const hasPassword = directKeys.includes('password');
      const hasSecret = directKeys.includes('secret');

      if (hasPassword && hasSecret) {
        this.context.logger.info(
          '[CASE 7] PASSED | Connector query returns hidden fields | password: %s | secret: %s',
          directUser.password ? '***' : 'null',
          directUser.secret ? '***' : 'null',
        );
        this.context.logger.info('[CASE 7] Direct query keys: %s', directKeys.join(', '));
      } else {
        this.context.logger.error(
          '[CASE 7] FAILED | Connector query should return hidden fields | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Verify data is actually stored in DB (via connector)
  // ----------------------------------------------------------------
  async case12VerifyDataActuallyStoredInDB(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 12] Verify hidden data is actually stored in DB');

    try {
      const uniqueId = getUID();
      const testPassword = `testPw${uniqueId}`;
      const testSecret = `testSecret${uniqueId}`;
      const testRealm = `HIDDEN_TEST_VERIFY_${uniqueId}`;

      await repo.create({
        data: {
          realm: testRealm,
          username: `verify_${uniqueId}`,
          email: `verify_${uniqueId}@test.com`,
          password: testPassword,
          secret: testSecret,
        },
      });

      const connector = repo.connector;
      const directResults = await connector
        .select()
        .from(User.schema)
        .where(like(User.schema.realm, 'HIDDEN_TEST_VERIFY_%'));

      if (directResults.length === 0) {
        this.context.logger.error('[CASE 12] FAILED | No records found via connector');
        return;
      }

      const storedUser = directResults[0];

      if (storedUser.password === testPassword && storedUser.secret === testSecret) {
        this.context.logger.info('[CASE 12] PASSED | Hidden data correctly stored in DB');
        this.context.logger.info(
          '[CASE 12] Stored password matches: %s | Stored secret matches: %s',
          storedUser.password === testPassword,
          storedUser.secret === testSecret,
        );
      } else {
        this.context.logger.error(
          '[CASE 12] FAILED | Stored values do not match | password: %s | secret: %s',
          storedUser.password,
          storedUser.secret,
        );
      }

      await connector.delete(User.schema).where(like(User.schema.realm, 'HIDDEN_TEST_VERIFY_%'));
    } catch (error) {
      this.context.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Transaction context - hidden properties should work in transactions
  // ----------------------------------------------------------------
  async case16TransactionContextHidden(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase(
      '[CASE 16] Hidden properties should work correctly in transaction context',
    );

    const transaction = await repo.beginTransaction();

    try {
      const uniqueId = getUID();
      const created = await repo.create({
        data: {
          realm: `HIDDEN_TEST_TX_${uniqueId}`,
          username: `tx_${uniqueId}`,
          email: `tx_${uniqueId}@test.com`,
          password: 'tx_password',
          secret: 'tx_secret',
        },
        options: { transaction },
      });

      const createKeys = Object.keys(created.data);
      const createHasPassword = createKeys.includes('password');

      if (createHasPassword) {
        this.context.logger.error('[CASE 16] FAILED | Create in TX returned hidden field');
        await transaction.rollback();
        return;
      }

      const found = await repo.findById({
        id: created.data.id,
        options: { transaction },
      });

      if (!found) {
        this.context.logger.error('[CASE 16] FAILED | Could not find created user in TX');
        await transaction.rollback();
        return;
      }

      const findKeys = Object.keys(found);
      const findHasPassword = findKeys.includes('password');

      if (findHasPassword) {
        this.context.logger.error('[CASE 16] FAILED | Find in TX returned hidden field');
        await transaction.rollback();
        return;
      }

      const updated = await repo.updateById({
        id: created.data.id,
        data: { password: 'new_tx_password' },
        options: { transaction },
      });

      const updateKeys = Object.keys(updated.data);
      const updateHasPassword = updateKeys.includes('password');

      if (updateHasPassword) {
        this.context.logger.error('[CASE 16] FAILED | Update in TX returned hidden field');
        await transaction.rollback();
        return;
      }

      await transaction.commit();
      this.context.logger.info(
        '[CASE 16] PASSED | Hidden properties work correctly in transactions',
      );
      this.context.logger.info('[CASE 16] Create keys: %s', createKeys.join(', '));
    } catch (error) {
      await transaction.rollback();
      this.context.logger.error('[CASE 16] FAILED | Error: %s', (error as Error).message);
    }
  }

  // Case 17 removed - redundant with Case 11 (both test field selection with hidden properties)

  // ----------------------------------------------------------------
  // CASE 18: Multiple users with mixed null/non-null hidden values - verify ALL have hidden excluded
  // ----------------------------------------------------------------
  async case18MultipleUsersHiddenExcluded(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase(
      '[CASE 18] Verify ALL users (with mixed hidden values) have hidden excluded',
    );

    try {
      const uid1 = getUID();
      const uid2 = getUID();
      const uid3 = getUID();
      const uid4 = getUID();
      await repo.createAll({
        data: [
          {
            realm: `HIDDEN_TEST_MULTI1_${uid1}`,
            username: `multi1_${uid1}`,
            email: `multi1_${uid1}@test.com`,
            password: 'pw1',
            secret: 'sec1',
          },
          {
            realm: `HIDDEN_TEST_MULTI2_${uid2}`,
            username: `multi2_${uid2}`,
            email: `multi2_${uid2}@test.com`,
            password: 'pw2',
            secret: null,
          },
          {
            realm: `HIDDEN_TEST_MULTI3_${uid3}`,
            username: `multi3_${uid3}`,
            email: `multi3_${uid3}@test.com`,
            password: null,
            secret: 'sec3',
          },
          {
            realm: `HIDDEN_TEST_MULTI4_${uid4}`,
            username: `multi4_${uid4}`,
            email: `multi4_${uid4}@test.com`,
            password: null,
            secret: null,
          },
        ],
      });

      const users = await repo.find({
        filter: { where: { realm: { like: 'HIDDEN_TEST_MULTI%' } } },
      });

      if (users.length < 4) {
        this.context.logger.error(
          '[CASE 18] FAILED | Expected at least 4 users | got: %d',
          users.length,
        );
        return;
      }

      let failedCount = 0;
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const userKeys = Object.keys(user);
        const hasPassword = userKeys.includes('password');
        const hasSecret = userKeys.includes('secret');

        if (hasPassword || hasSecret) {
          failedCount++;
          this.context.logger.error(
            '[CASE 18] User %d (%s) has hidden | hasPassword: %s | hasSecret: %s',
            i,
            user.realm,
            hasPassword,
            hasSecret,
          );
        }
      }

      if (failedCount === 0) {
        this.context.logger.info(
          '[CASE 18] PASSED | All %d users have hidden fields excluded',
          users.length,
        );
      } else {
        this.context.logger.error(
          '[CASE 18] FAILED | %d users have hidden fields exposed',
          failedCount,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 18] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 20: Null/undefined hidden field values - edge case
  // ----------------------------------------------------------------
  async case20NullHiddenFieldValues(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 20] Handle null hidden field values correctly');

    try {
      const uniqueId = getUID();
      const created = await repo.create({
        data: {
          realm: `HIDDEN_TEST_NULL_${uniqueId}`,
          username: `null_${uniqueId}`,
          email: `null_${uniqueId}@test.com`,
          password: null,
          secret: null,
        },
      });

      const createKeys = Object.keys(created.data);
      const hasPassword = createKeys.includes('password');
      const hasSecret = createKeys.includes('secret');

      if (hasPassword || hasSecret) {
        this.context.logger.error('[CASE 20] FAILED | Null hidden fields should still be excluded');
        return;
      }

      const found = await repo.findById({ id: created.data.id });
      if (!found) {
        this.context.logger.error('[CASE 20] FAILED | User not found');
        return;
      }

      const findKeys = Object.keys(found);
      const findHasPassword = findKeys.includes('password');
      const findHasSecret = findKeys.includes('secret');

      if (findHasPassword || findHasSecret) {
        this.context.logger.error('[CASE 20] FAILED | Find returned null hidden fields');
        return;
      }

      const connector = repo.connector;
      const directResult = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, created.data.id));

      if (directResult.length === 0) {
        this.context.logger.error('[CASE 20] FAILED | User not found via connector');
        return;
      }

      const dbUser = directResult[0];
      if (dbUser.password === null && dbUser.secret === null) {
        this.context.logger.info(
          '[CASE 20] PASSED | Null hidden fields stored and excluded correctly',
        );
      } else {
        this.context.logger.error(
          '[CASE 20] FAILED | Expected null values | password: %s | secret: %s',
          dbUser.password,
          dbUser.secret,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 20] FAILED | Error: %s', (error as Error).message);
    }
  }
}
