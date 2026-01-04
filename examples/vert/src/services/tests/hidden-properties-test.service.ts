import { BindingKeys, BindingNamespaces, getUID, inject } from '@venizia/ignis';
import { eq, like } from 'drizzle-orm';
import { User } from '../../models/entities';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';
import { BaseTestService } from './base-test.service';

// ----------------------------------------------------------------
// Hidden Properties Test Service - Hidden field exclusion tests
// ----------------------------------------------------------------
export class HiddenPropertiesTestService extends BaseTestService {
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
      HiddenPropertiesTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[HiddenPropertiesTestService] Starting hidden properties test cases');

    // Basic CRUD tests
    await this.case1_CreateUserWithHiddenFields();
    await this.case2_FindOperationsExcludeHidden(); // Consolidated: findOne, find, findById
    await this.case5_UpdateByIdExcludesHidden();

    // Edge cases
    await this.case7_ConnectorQueryReturnsHidden();
    await this.case8_CreateAllExcludesHidden();
    await this.case9_UpdateAllExcludesHidden();
    await this.case10_DeleteByIdExcludesHidden();
    await this.case11_FieldsSelectionStillExcludesHidden();
    await this.case12_VerifyDataActuallyStoredInDB();

    // Advanced edge cases
    await this.case13_WhereClauseCanFilterByHidden();
    await this.case14_CountWithHiddenInWhere();
    await this.case15_ExistsWithHiddenInWhere();
    await this.case16_TransactionContextHidden();
    // Case 17 removed - redundant with Case 11 (both test field selection with hidden)
    await this.case18_MultipleUsersHiddenExcluded(); // Renamed for clarity
    await this.case19_UpdateOnlyHiddenFields();
    await this.case20_NullHiddenFieldValues();

    // Relation hidden properties
    await this.case21_RelationHiddenProperties();

    // Cleanup last
    await this.case6_Cleanup();

    this.logSection('[HiddenPropertiesTestService] All hidden properties test cases completed!');
  }

  // ----------------------------------------------------------------
  // CASE 1: Create user with hidden fields - verify they are not returned
  // ----------------------------------------------------------------
  private async case1_CreateUserWithHiddenFields(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 1] Create user with password and secret - verify hidden in response');

    try {
      const uniqueId = getUID();
      const testRealm = `HIDDEN_TEST_${uniqueId}`;
      const created = await repo.create({
        data: {
          realm: testRealm,
          username: `hidden_test_${uniqueId}`,
          email: `hidden_test_${uniqueId}@test.com`,
          password: 'super_secret_password_123',
          secret: 'top_secret_token_456',
        },
      });

      const hasPassword = 'password' in created.data;
      const hasSecret = 'secret' in created.data;

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[CASE 1] FAILED | Hidden fields should NOT be in create response | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
        this.logger.error('[CASE 1] Response data: %j', created.data);
      } else {
        this.logger.info(
          '[CASE 1] PASSED | Hidden fields excluded from create response | id: %s | realm: %s',
          created.data.id,
          created.data.realm,
        );
        this.logger.info('[CASE 1] Response keys: %s', Object.keys(created.data).join(', '));
      }
    } catch (error) {
      this.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: All find operations (findOne, find, findById) exclude hidden properties
  // Consolidated from Cases 2, 3, 4 - they tested the same behavior
  // ----------------------------------------------------------------
  private async case2_FindOperationsExcludeHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 2] All find operations should exclude hidden properties');

    try {
      // Test findOne
      const findOneUser = await repo.findOne({
        filter: { where: { realm: { like: 'HIDDEN_TEST_%' } } },
      });

      if (!findOneUser) {
        this.logger.warn('[CASE 2] SKIPPED | No test user found');
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
      const findByIdHasHidden = findByIdKeys.includes('password') || findByIdKeys.includes('secret');

      // Report results
      if (findOneHasHidden || findHasHidden || findByIdHasHidden) {
        this.logger.error(
          '[CASE 2] FAILED | Hidden fields found | findOne: %s | find: %s | findById: %s',
          findOneHasHidden,
          findHasHidden,
          findByIdHasHidden,
        );
      } else {
        this.logger.info(
          '[CASE 2] PASSED | All find operations exclude hidden | findOne: %s users | find: %d users | findById: %s',
          findOneUser.id,
          findUsers.length,
          findByIdUser?.id,
        );
        this.logger.info('[CASE 2] Sample keys: %s', findOneKeys.join(', '));
      }
    } catch (error) {
      this.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: UpdateById excludes hidden properties in response
  // ----------------------------------------------------------------
  private async case5_UpdateByIdExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 5] UpdateById should exclude hidden properties in response');

    try {
      const anyUser = await repo.findOne({
        filter: { where: { realm: { like: 'HIDDEN_TEST_%' } } },
      });

      if (!anyUser) {
        this.logger.warn('[CASE 5] SKIPPED | No test user found');
        return;
      }

      const updated = await repo.updateById({
        id: anyUser.id,
        data: {
          realm: `HIDDEN_TEST_UPDATED_${getUID()}`,
          password: 'new_password_789',
        },
      });

      const hasPassword = 'password' in updated.data;
      const hasSecret = 'secret' in updated.data;

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[CASE 5] FAILED | Hidden fields should NOT be in updateById response | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else {
        this.logger.info(
          '[CASE 5] PASSED | Hidden fields excluded from updateById response | id: %s | newRealm: %s',
          updated.data.id,
          updated.data.realm,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: Cleanup test data (runs last in test sequence)
  // ----------------------------------------------------------------
  private async case6_Cleanup(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CLEANUP] Cleanup hidden properties test data');

    try {
      const deleted = await repo.deleteAll({
        where: { realm: { like: 'HIDDEN_TEST_%' } },
      });

      if (deleted.data && deleted.data.length > 0) {
        const firstDeleted = deleted.data[0];
        const hasPassword = 'password' in firstDeleted;
        const hasSecret = 'secret' in firstDeleted;

        if (hasPassword || hasSecret) {
          this.logger.error(
            '[CASE 6] Note: Hidden fields found in delete response | hasPassword: %s | hasSecret: %s',
            hasPassword,
            hasSecret,
          );
        }
      }

      this.logger.info('[CASE 6] PASSED | Deleted %d test users', deleted.count);
    } catch (error) {
      this.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Connector query SHOULD return hidden properties (bypass repository)
  // ----------------------------------------------------------------
  private async case7_ConnectorQueryReturnsHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 7] Connector query SHOULD return hidden properties');

    try {
      const repoUser = await repo.findOne({
        filter: { where: { realm: { like: 'HIDDEN_TEST_%' } } },
      });

      if (!repoUser) {
        this.logger.warn('[CASE 7] SKIPPED | No test user found');
        return;
      }

      const connector = repo.getConnector();
      const directResults = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, repoUser.id));

      if (directResults.length === 0) {
        this.logger.error('[CASE 7] FAILED | Direct query returned no results');
        return;
      }

      const directUser = directResults[0];
      const directKeys = Object.keys(directUser);
      const hasPassword = directKeys.includes('password');
      const hasSecret = directKeys.includes('secret');

      if (hasPassword && hasSecret) {
        this.logger.info(
          '[CASE 7] PASSED | Connector query returns hidden fields | password: %s | secret: %s',
          directUser.password ? '***' : 'null',
          directUser.secret ? '***' : 'null',
        );
        this.logger.info('[CASE 7] Direct query keys: %s', directKeys.join(', '));
      } else {
        this.logger.error(
          '[CASE 7] FAILED | Connector query should return hidden fields | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: CreateAll (batch create) excludes hidden properties
  // ----------------------------------------------------------------
  private async case8_CreateAllExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 8] CreateAll should exclude hidden properties from response');

    try {
      const uid1 = getUID();
      const uid2 = getUID();
      const created = await repo.createAll({
        data: [
          {
            realm: `HIDDEN_TEST_BATCH1_${uid1}`,
            username: `batch1_${uid1}`,
            email: `batch1_${uid1}@test.com`,
            password: 'batch_password_1',
            secret: 'batch_secret_1',
          },
          {
            realm: `HIDDEN_TEST_BATCH2_${uid2}`,
            username: `batch2_${uid2}`,
            email: `batch2_${uid2}@test.com`,
            password: 'batch_password_2',
            secret: 'batch_secret_2',
          },
        ],
      });

      if (created.count !== 2 || created.data?.length !== 2) {
        this.logger.error('[CASE 8] FAILED | Expected 2 records created');
        return;
      }

      let hasFailed = false;
      for (const user of created.data) {
        const userKeys = Object.keys(user);
        const hasPassword = userKeys.includes('password');
        const hasSecret = userKeys.includes('secret');

        if (hasPassword || hasSecret) {
          hasFailed = true;
          this.logger.error(
            '[CASE 8] FAILED | User %s has hidden fields in createAll response',
            user.id,
          );
        }
      }

      if (!hasFailed) {
        this.logger.info(
          '[CASE 8] PASSED | CreateAll excludes hidden from all %d records',
          created.count,
        );
        this.logger.info('[CASE 8] Sample keys: %s', Object.keys(created.data[0]).join(', '));
      }
    } catch (error) {
      this.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: UpdateAll (bulk update) excludes hidden properties
  // ----------------------------------------------------------------
  private async case9_UpdateAllExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 9] UpdateAll should exclude hidden properties from response');

    try {
      const updated = await repo.updateAll({
        where: { realm: { like: 'HIDDEN_TEST_%' } },
        data: {
          password: 'updated_bulk_password',
          secret: 'updated_bulk_secret',
        },
      });

      if (updated.count === 0) {
        this.logger.warn('[CASE 9] SKIPPED | No test users to update');
        return;
      }

      if (!updated.data || updated.data.length === 0) {
        this.logger.warn('[CASE 9] SKIPPED | No data returned (shouldReturn may be false)');
        return;
      }

      let hasFailed = false;
      for (const user of updated.data) {
        const userKeys = Object.keys(user);
        const hasPassword = userKeys.includes('password');
        const hasSecret = userKeys.includes('secret');

        if (hasPassword || hasSecret) {
          hasFailed = true;
          this.logger.error(
            '[CASE 9] FAILED | User %s has hidden fields in updateAll response',
            user.id,
          );
        }
      }

      if (!hasFailed) {
        this.logger.info(
          '[CASE 9] PASSED | UpdateAll excludes hidden from all %d records',
          updated.count,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: DeleteById excludes hidden properties from response
  // ----------------------------------------------------------------
  private async case10_DeleteByIdExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 10] DeleteById should exclude hidden properties from response');

    try {
      const uniqueId = getUID();
      const created = await repo.create({
        data: {
          realm: `HIDDEN_TEST_DELETE_${uniqueId}`,
          username: `delete_${uniqueId}`,
          email: `delete_${uniqueId}@test.com`,
          password: 'delete_test_password',
          secret: 'delete_test_secret',
        },
      });

      const userId = created.data.id;
      const deleted = await repo.deleteById({ id: userId });

      if (deleted.count !== 1 || !deleted.data) {
        this.logger.error('[CASE 10] FAILED | Expected 1 record deleted');
        return;
      }

      const deletedKeys = Object.keys(deleted.data);
      const hasPassword = deletedKeys.includes('password');
      const hasSecret = deletedKeys.includes('secret');

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[CASE 10] FAILED | DeleteById response has hidden fields | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else {
        this.logger.info(
          '[CASE 10] PASSED | DeleteById excludes hidden fields | id: %s',
          deleted.data.id,
        );
        this.logger.info('[CASE 10] Response keys: %s', deletedKeys.join(', '));
      }
    } catch (error) {
      this.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Fields selection still excludes hidden (even if explicitly requested)
  // ----------------------------------------------------------------
  private async case11_FieldsSelectionStillExcludesHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 11] Fields selection should still exclude hidden properties');

    try {
      const users = await repo.find({
        filter: {
          where: { realm: { like: 'HIDDEN_TEST_%' } },
          fields: ['id', 'realm', 'password', 'secret'],
        },
      });

      if (users.length === 0) {
        this.logger.warn('[CASE 11] SKIPPED | No test users found');
        return;
      }

      const firstUser = users[0];
      const userKeys = Object.keys(firstUser);
      const hasPassword = userKeys.includes('password');
      const hasSecret = userKeys.includes('secret');
      const hasId = userKeys.includes('id');
      const hasRealm = userKeys.includes('realm');

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[CASE 11] FAILED | Hidden fields returned despite being hidden | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else if (hasId && hasRealm) {
        this.logger.info(
          '[CASE 11] PASSED | Hidden fields excluded even when explicitly requested',
        );
        this.logger.info(
          '[CASE 11] Requested: [id, realm, password, secret] | Got: %s',
          userKeys.join(', '),
        );
      } else {
        this.logger.error(
          '[CASE 11] FAILED | Non-hidden requested fields missing | hasId: %s | hasRealm: %s',
          hasId,
          hasRealm,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Verify data is actually stored in DB (via connector)
  // ----------------------------------------------------------------
  private async case12_VerifyDataActuallyStoredInDB(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 12] Verify hidden data is actually stored in DB');

    try {
      const uniqueId = getUID();
      const testPassword = `test_pw_${uniqueId}`;
      const testSecret = `test_secret_${uniqueId}`;
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

      const connector = repo.getConnector();
      const directResults = await connector
        .select()
        .from(User.schema)
        .where(like(User.schema.realm, 'HIDDEN_TEST_VERIFY_%'));

      if (directResults.length === 0) {
        this.logger.error('[CASE 12] FAILED | No records found via connector');
        return;
      }

      const storedUser = directResults[0];

      if (storedUser.password === testPassword && storedUser.secret === testSecret) {
        this.logger.info('[CASE 12] PASSED | Hidden data correctly stored in DB');
        this.logger.info(
          '[CASE 12] Stored password matches: %s | Stored secret matches: %s',
          storedUser.password === testPassword,
          storedUser.secret === testSecret,
        );
      } else {
        this.logger.error(
          '[CASE 12] FAILED | Stored values do not match | password: %s | secret: %s',
          storedUser.password,
          storedUser.secret,
        );
      }

      await connector.delete(User.schema).where(like(User.schema.realm, 'HIDDEN_TEST_VERIFY_%'));
    } catch (error) {
      this.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Where clause CAN filter by hidden field
  // ----------------------------------------------------------------
  private async case13_WhereClauseCanFilterByHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 13] Where clause should be able to filter by hidden field');

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
        this.logger.error('[CASE 13] FAILED | Could not find user by password filter');
        return;
      }

      if (foundByPassword.realm !== testRealm) {
        this.logger.error(
          '[CASE 13] FAILED | Found wrong user | expected realm: %s | got: %s',
          testRealm,
          foundByPassword.realm,
        );
        return;
      }

      const resultKeys = Object.keys(foundByPassword);
      const hasPassword = resultKeys.includes('password');

      if (hasPassword) {
        this.logger.error('[CASE 13] FAILED | Password should NOT be in result');
      } else {
        this.logger.info(
          '[CASE 13] PASSED | Can filter by hidden field but it is excluded from result',
        );
        this.logger.info('[CASE 13] Found user by password, realm: %s', foundByPassword.realm);
      }
    } catch (error) {
      this.logger.error('[CASE 13] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Count operation with hidden field in where clause
  // ----------------------------------------------------------------
  private async case14_CountWithHiddenInWhere(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 14] Count should work with hidden field in where clause');

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
        this.logger.info(
          '[CASE 14] PASSED | Count works with hidden field filter | count: %d',
          count.count,
        );
      } else {
        this.logger.error('[CASE 14] FAILED | Expected count 2 | got: %d', count.count);
      }
    } catch (error) {
      this.logger.error('[CASE 14] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: ExistsWith operation with hidden field in where clause
  // ----------------------------------------------------------------
  private async case15_ExistsWithHiddenInWhere(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 15] ExistsWith should work with hidden field in where clause');

    try {
      const connector = repo.getConnector();
      const directResults = await connector
        .select()
        .from(User.schema)
        .where(like(User.schema.realm, 'HIDDEN_TEST_%'))
        .limit(1);

      if (directResults.length === 0) {
        this.logger.warn('[CASE 15] SKIPPED | No test users found');
        return;
      }

      const knownPassword = directResults[0].password;

      if (!knownPassword) {
        this.logger.warn('[CASE 15] SKIPPED | Test user has no password');
        return;
      }

      const exists = await repo.existsWith({
        where: { password: knownPassword },
      });

      const notExists = await repo.existsWith({
        where: { password: 'definitely_not_a_real_password_xyz_123' },
      });

      if (exists && !notExists) {
        this.logger.info('[CASE 15] PASSED | ExistsWith works with hidden field filter');
      } else {
        this.logger.error(
          '[CASE 15] FAILED | exists: %s (expected true) | notExists: %s (expected false)',
          exists,
          notExists,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 15] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Transaction context - hidden properties should work in transactions
  // ----------------------------------------------------------------
  private async case16_TransactionContextHidden(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 16] Hidden properties should work correctly in transaction context');

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
        this.logger.error('[CASE 16] FAILED | Create in TX returned hidden field');
        await transaction.rollback();
        return;
      }

      const found = await repo.findById({
        id: created.data.id,
        options: { transaction },
      });

      if (!found) {
        this.logger.error('[CASE 16] FAILED | Could not find created user in TX');
        await transaction.rollback();
        return;
      }

      const findKeys = Object.keys(found);
      const findHasPassword = findKeys.includes('password');

      if (findHasPassword) {
        this.logger.error('[CASE 16] FAILED | Find in TX returned hidden field');
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
        this.logger.error('[CASE 16] FAILED | Update in TX returned hidden field');
        await transaction.rollback();
        return;
      }

      await transaction.commit();
      this.logger.info('[CASE 16] PASSED | Hidden properties work correctly in transactions');
      this.logger.info('[CASE 16] Create keys: %s', createKeys.join(', '));
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 16] FAILED | Error: %s', (error as Error).message);
    }
  }

  // Case 17 removed - redundant with Case 11 (both test field selection with hidden properties)

  // ----------------------------------------------------------------
  // CASE 18: Multiple users with mixed null/non-null hidden values - verify ALL have hidden excluded
  // ----------------------------------------------------------------
  private async case18_MultipleUsersHiddenExcluded(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 18] Verify ALL users (with mixed hidden values) have hidden excluded');

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
        this.logger.error('[CASE 18] FAILED | Expected at least 4 users | got: %d', users.length);
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
          this.logger.error(
            '[CASE 18] User %d (%s) has hidden | hasPassword: %s | hasSecret: %s',
            i,
            user.realm,
            hasPassword,
            hasSecret,
          );
        }
      }

      if (failedCount === 0) {
        this.logger.info(
          '[CASE 18] PASSED | All %d users have hidden fields excluded',
          users.length,
        );
      } else {
        this.logger.error('[CASE 18] FAILED | %d users have hidden fields exposed', failedCount);
      }
    } catch (error) {
      this.logger.error('[CASE 18] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: Update ONLY hidden fields - should work but response excludes them
  // ----------------------------------------------------------------
  private async case19_UpdateOnlyHiddenFields(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 19] Update ONLY hidden fields - should work but exclude from response');

    try {
      const uniqueId = getUID();
      const created = await repo.create({
        data: {
          realm: `HIDDEN_TEST_ONLYHIDDEN_${uniqueId}`,
          username: `onlyhidden_${uniqueId}`,
          email: `onlyhidden_${uniqueId}@test.com`,
          password: 'original_password',
          secret: 'original_secret',
        },
      });

      const userId = created.data.id;
      const originalRealm = created.data.realm;

      const updated = await repo.updateById({
        id: userId,
        data: {
          password: 'new_password_only',
          secret: 'new_secret_only',
        },
      });

      const updateKeys = Object.keys(updated.data);
      const hasPassword = updateKeys.includes('password');
      const hasSecret = updateKeys.includes('secret');

      if (hasPassword || hasSecret) {
        this.logger.error('[CASE 19] FAILED | Update response has hidden fields');
        return;
      }

      if (updated.data.realm !== originalRealm) {
        this.logger.error('[CASE 19] FAILED | Non-hidden field changed unexpectedly');
        return;
      }

      const connector = repo.getConnector();
      const directResult = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, userId));

      if (directResult.length === 0) {
        this.logger.error('[CASE 19] FAILED | User not found via connector');
        return;
      }

      const dbUser = directResult[0];
      if (dbUser.password === 'new_password_only' && dbUser.secret === 'new_secret_only') {
        this.logger.info('[CASE 19] PASSED | Hidden fields updated but excluded from response');
        this.logger.info(
          '[CASE 19] DB password: %s | DB secret: %s',
          dbUser.password,
          dbUser.secret,
        );
      } else {
        this.logger.error(
          '[CASE 19] FAILED | Hidden fields not updated | password: %s | secret: %s',
          dbUser.password,
          dbUser.secret,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 19] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 20: Null/undefined hidden field values - edge case
  // ----------------------------------------------------------------
  private async case20_NullHiddenFieldValues(): Promise<void> {
    const repo = this.userRepository;
    this.logCase('[CASE 20] Handle null hidden field values correctly');

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
        this.logger.error('[CASE 20] FAILED | Null hidden fields should still be excluded');
        return;
      }

      const found = await repo.findById({ id: created.data.id });
      if (!found) {
        this.logger.error('[CASE 20] FAILED | User not found');
        return;
      }

      const findKeys = Object.keys(found);
      const findHasPassword = findKeys.includes('password');
      const findHasSecret = findKeys.includes('secret');

      if (findHasPassword || findHasSecret) {
        this.logger.error('[CASE 20] FAILED | Find returned null hidden fields');
        return;
      }

      const connector = repo.getConnector();
      const directResult = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, created.data.id));

      if (directResult.length === 0) {
        this.logger.error('[CASE 20] FAILED | User not found via connector');
        return;
      }

      const dbUser = directResult[0];
      if (dbUser.password === null && dbUser.secret === null) {
        this.logger.info('[CASE 20] PASSED | Null hidden fields stored and excluded correctly');
      } else {
        this.logger.error(
          '[CASE 20] FAILED | Expected null values | password: %s | secret: %s',
          dbUser.password,
          dbUser.secret,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 20] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 21: Relation hidden properties - included relations should exclude hidden
  // ----------------------------------------------------------------
  private async case21_RelationHiddenProperties(): Promise<void> {
    this.logCase('[CASE 21] Relations should exclude hidden properties from related entities');

    try {
      const testRealm = 'hidden_relation_test';
      let testUser = await this.userRepository.findOne({
        filter: { where: { realm: testRealm } },
      });

      if (!testUser) {
        const created = await this.userRepository.create({
          data: {
            realm: testRealm,
            username: 'hidden_relation_user',
            email: 'hidden_relation@test.com',
            password: 'relation_test_password',
            secret: 'relation_test_secret',
          },
        });
        testUser = created.data;
        this.logger.info('[CASE 21] Created test user | id: %s', testUser?.id);
      }

      if (!testUser) {
        this.logger.warn('[CASE 21] SKIPPED | Could not create test user');
        return;
      }

      const configRepo = this.configurationRepository;
      const testConfigCode = `HIDDEN_REL_TEST_${Date.now()}`;

      const createdConfig = await configRepo.create({
        data: {
          code: testConfigCode,
          group: 'HIDDEN_TEST',
          description: 'Test for relation hidden properties',
          createdBy: testUser.id,
          modifiedBy: testUser.id,
        },
      });

      if (!createdConfig.data) {
        this.logger.error('[CASE 21] FAILED | Could not create test configuration');
        return;
      }

      this.logger.info(
        '[CASE 21] Created test config | id: %s | code: %s',
        createdConfig.data.id,
        testConfigCode,
      );

      const configWithCreator = await configRepo.findOne({
        filter: {
          where: { id: createdConfig.data.id },
          include: [{ relation: 'creator' }],
        },
      });

      if (!configWithCreator) {
        this.logger.error('[CASE 21] FAILED | Could not find configuration with creator');
        return;
      }

      const creator = (configWithCreator as any).creator;
      if (!creator) {
        this.logger.error('[CASE 21] FAILED | Creator relation not included in result');
        return;
      }

      const creatorKeys = Object.keys(creator);
      const hasPassword = creatorKeys.includes('password');
      const hasSecret = creatorKeys.includes('secret');

      this.logger.info('[CASE 21] Creator relation keys: %s', creatorKeys.join(', '));

      if (hasPassword || hasSecret) {
        this.logger.error(
          '[CASE 21] FAILED | Creator relation has hidden fields | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else {
        this.logger.info('[CASE 21] PASSED | Creator relation excludes hidden fields');
        this.logger.info('[CASE 21] Creator id: %s | realm: %s', creator.id, creator.realm);
      }

      const connector = this.userRepository.getConnector();

      const [dbUser] = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, testUser.id));

      if (
        dbUser?.password === 'relation_test_password' &&
        dbUser?.secret === 'relation_test_secret'
      ) {
        this.logger.info('[CASE 21] Verified: Hidden data exists in DB for related user');
      } else {
        this.logger.warn('[CASE 21] Warning: Could not verify hidden data in DB');
      }

      await configRepo.deleteById({ id: createdConfig.data.id });
      this.logger.info('[CASE 21] Cleaned up test configuration');

      await this.userRepository.deleteAll({
        where: { realm: testRealm },
        options: { force: true },
      });
      this.logger.info('[CASE 21] Cleaned up test user');
    } catch (error) {
      this.logger.error('[CASE 21] FAILED | Error: %s', (error as Error).message);
    }
  }
}
