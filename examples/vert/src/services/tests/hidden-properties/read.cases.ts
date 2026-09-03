import { getUID } from '@venizia/ignis-helpers';
import { like } from 'drizzle-orm';
import { User } from '../../../models/entities';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Read Cases - find/count/exists operations exclude hidden properties
// ----------------------------------------------------------------
export class ReadCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 2: All find operations (findOne, find, findById) exclude hidden properties
  // Consolidated from Cases 2, 3, 4 - they tested the same behavior
  // ----------------------------------------------------------------
  async case2FindOperationsExcludeHidden(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 2] All find operations should exclude hidden properties');

    try {
      // Test findOne
      const findOneUser = await repo.findOne({
        filter: { where: { realm: { like: 'HIDDEN_TEST_%' } } },
      });

      if (!findOneUser) {
        this.context.logger.warn('[CASE 2] SKIPPED | No test user found');
        return;
      }

      const findOneKeys = Object.keys(findOneUser);
      const findOneHasHidden = findOneKeys.includes('password') || findOneKeys.includes('secret');

      // Test find (multiple)
      const findUsers = await repo.find({
        filter: { where: { realm: { like: 'HIDDEN_TEST_%' } } },
      });

      let findHasHidden = false;
      for (const user of findUsers) {
        if ('password' in user || 'secret' in user) {
          findHasHidden = true;
          break;
        }
      }

      // Test findById
      const findByIdUser = await repo.findById({ id: findOneUser.id });
      const findByIdKeys = findByIdUser ? Object.keys(findByIdUser) : [];
      const findByIdHasHidden =
        findByIdKeys.includes('password') || findByIdKeys.includes('secret');

      // Report results
      if (findOneHasHidden || findHasHidden || findByIdHasHidden) {
        this.context.logger.error(
          '[CASE 2] FAILED | Hidden fields found | findOne: %s | find: %s | findById: %s',
          findOneHasHidden,
          findHasHidden,
          findByIdHasHidden,
        );
      } else {
        this.context.logger.info(
          '[CASE 2] PASSED | All find operations exclude hidden | findOne: %s users | find: %d users | findById: %s',
          findOneUser.id,
          findUsers.length,
          findByIdUser?.id,
        );
        this.context.logger.info('[CASE 2] Sample keys: %s', findOneKeys.join(', '));
      }
    } catch (error) {
      this.context.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Fields selection still excludes hidden (even if explicitly requested)
  // ----------------------------------------------------------------
  async case11FieldsSelectionStillExcludesHidden(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 11] Fields selection should still exclude hidden properties');

    try {
      const users = await repo.find({
        filter: {
          where: { realm: { like: 'HIDDEN_TEST_%' } },
          fields: ['id', 'realm', 'password', 'secret'],
        },
      });

      if (users.length === 0) {
        this.context.logger.warn('[CASE 11] SKIPPED | No test users found');
        return;
      }

      const firstUser = users[0];
      const userKeys = Object.keys(firstUser);
      const hasPassword = userKeys.includes('password');
      const hasSecret = userKeys.includes('secret');
      const hasId = userKeys.includes('id');
      const hasRealm = userKeys.includes('realm');

      if (hasPassword || hasSecret) {
        this.context.logger.error(
          '[CASE 11] FAILED | Hidden fields returned despite being hidden | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else if (hasId && hasRealm) {
        this.context.logger.info(
          '[CASE 11] PASSED | Hidden fields excluded even when explicitly requested',
        );
        this.context.logger.info(
          '[CASE 11] Requested: [id, realm, password, secret] | Got: %s',
          userKeys.join(', '),
        );
      } else {
        this.context.logger.error(
          '[CASE 11] FAILED | Non-hidden requested fields missing | hasId: %s | hasRealm: %s',
          hasId,
          hasRealm,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Where clause CAN filter by hidden field
  // ----------------------------------------------------------------
  async case13WhereClauseCanFilterByHidden(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 13] Where clause should be able to filter by hidden field');

    try {
      const uniqueId = getUID();
      const knownPassword = `unique_password_${uniqueId}`;
      const testRealm = `HIDDEN_TEST_WHERE_${uniqueId}`;

      await repo.create({
        data: {
          realm: testRealm,
          username: `where_${uniqueId}`,
          email: `where_${uniqueId}@test.com`,
          password: knownPassword,
          secret: 'some_secret',
        },
      });

      const foundByPassword = await repo.findOne({
        filter: {
          where: { password: knownPassword },
        },
      });

      if (!foundByPassword) {
        this.context.logger.error('[CASE 13] FAILED | Could not find user by password filter');
        return;
      }

      if (foundByPassword.realm !== testRealm) {
        this.context.logger.error(
          '[CASE 13] FAILED | Found wrong user | expected realm: %s | got: %s',
          testRealm,
          foundByPassword.realm,
        );
        return;
      }

      const resultKeys = Object.keys(foundByPassword);
      const hasPassword = resultKeys.includes('password');

      if (hasPassword) {
        this.context.logger.error('[CASE 13] FAILED | Password should NOT be in result');
      } else {
        this.context.logger.info(
          '[CASE 13] PASSED | Can filter by hidden field but it is excluded from result',
        );
        this.context.logger.info(
          '[CASE 13] Found user by password, realm: %s',
          foundByPassword.realm,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 13] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Count operation with hidden field in where clause
  // ----------------------------------------------------------------
  async case14CountWithHiddenInWhere(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 14] Count should work with hidden field in where clause');

    try {
      const uid1 = getUID();
      const uid2 = getUID();
      const uid3 = getUID();
      const password1 = `count_pw_${uid1}`;
      const password2 = `count_pw_${uid3}`;

      await repo.createAll({
        data: [
          {
            realm: `HIDDEN_TEST_COUNT1_${uid1}`,
            username: `count1_${uid1}`,
            email: `count1_${uid1}@test.com`,
            password: password1,
            secret: 's1',
          },
          {
            realm: `HIDDEN_TEST_COUNT2_${uid2}`,
            username: `count2_${uid2}`,
            email: `count2_${uid2}@test.com`,
            password: password1,
            secret: 's2',
          },
          {
            realm: `HIDDEN_TEST_COUNT3_${uid3}`,
            username: `count3_${uid3}`,
            email: `count3_${uid3}@test.com`,
            password: password2,
            secret: 's3',
          },
        ],
      });

      const count = await repo.count({
        where: { password: password1 },
      });

      if (count.count === 2) {
        this.context.logger.info(
          '[CASE 14] PASSED | Count works with hidden field filter | count: %d',
          count.count,
        );
      } else {
        this.context.logger.error('[CASE 14] FAILED | Expected count 2 | got: %d', count.count);
      }
    } catch (error) {
      this.context.logger.error('[CASE 14] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: ExistsWith operation with hidden field in where clause
  // ----------------------------------------------------------------
  async case15ExistsWithHiddenInWhere(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 15] ExistsWith should work with hidden field in where clause');

    try {
      const connector = repo.connector;
      const directResults = await connector
        .select()
        .from(User.schema)
        .where(like(User.schema.realm, 'HIDDEN_TEST_%'))
        .limit(1);

      if (directResults.length === 0) {
        this.context.logger.warn('[CASE 15] SKIPPED | No test users found');
        return;
      }

      const knownPassword = directResults[0].password;

      if (!knownPassword) {
        this.context.logger.warn('[CASE 15] SKIPPED | Test user has no password');
        return;
      }

      const exists = await repo.existsWith({
        where: { password: knownPassword },
      });

      const notExists = await repo.existsWith({
        where: { password: 'definitely_not_a_real_password_xyz_123' },
      });

      if (exists && !notExists) {
        this.context.logger.info('[CASE 15] PASSED | ExistsWith works with hidden field filter');
      } else {
        this.context.logger.error(
          '[CASE 15] FAILED | exists: %s (expected true) | notExists: %s (expected false)',
          exists,
          notExists,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 15] FAILED | Error: %s', (error as Error).message);
    }
  }
}
