import { getUID } from '@venizia/ignis-helpers';
import { eq } from 'drizzle-orm';
import { User } from '../../../models/entities';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Write Cases - create/update/delete operations exclude hidden properties
// ----------------------------------------------------------------
export class WriteCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 1: Create user with hidden fields - verify they are not returned
  // ----------------------------------------------------------------
  async case1CreateUserWithHiddenFields(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase(
      '[CASE 1] Create user with password and secret - verify hidden in response',
    );

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
        this.context.logger.error(
          '[CASE 1] FAILED | Hidden fields should NOT be in create response | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
        this.context.logger.error('[CASE 1] Response data: %j', created.data);
      } else {
        this.context.logger.info(
          '[CASE 1] PASSED | Hidden fields excluded from create response | id: %s | realm: %s',
          created.data.id,
          created.data.realm,
        );
        this.context.logger.info(
          '[CASE 1] Response keys: %s',
          Object.keys(created.data).join(', '),
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: UpdateById excludes hidden properties in response
  // ----------------------------------------------------------------
  async case5UpdateByIdExcludesHidden(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 5] UpdateById should exclude hidden properties in response');

    try {
      const anyUser = await repo.findOne({
        filter: { where: { realm: { like: 'HIDDEN_TEST_%' } } },
      });

      if (!anyUser) {
        this.context.logger.warn('[CASE 5] SKIPPED | No test user found');
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
        this.context.logger.error(
          '[CASE 5] FAILED | Hidden fields should NOT be in updateById response | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else {
        this.context.logger.info(
          '[CASE 5] PASSED | Hidden fields excluded from updateById response | id: %s | newRealm: %s',
          updated.data.id,
          updated.data.realm,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: CreateAll (batch create) excludes hidden properties
  // ----------------------------------------------------------------
  async case8CreateAllExcludesHidden(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 8] CreateAll should exclude hidden properties from response');

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
        this.context.logger.error('[CASE 8] FAILED | Expected 2 records created');
        return;
      }

      let hasFailed = false;
      for (const user of created.data) {
        const userKeys = Object.keys(user);
        const hasPassword = userKeys.includes('password');
        const hasSecret = userKeys.includes('secret');

        if (hasPassword || hasSecret) {
          hasFailed = true;
          this.context.logger.error(
            '[CASE 8] FAILED | User %s has hidden fields in createAll response',
            user.id,
          );
        }
      }

      if (!hasFailed) {
        this.context.logger.info(
          '[CASE 8] PASSED | CreateAll excludes hidden from all %d records',
          created.count,
        );
        this.context.logger.info(
          '[CASE 8] Sample keys: %s',
          Object.keys(created.data[0]).join(', '),
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: UpdateAll (bulk update) excludes hidden properties
  // ----------------------------------------------------------------
  async case9UpdateAllExcludesHidden(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 9] UpdateAll should exclude hidden properties from response');

    try {
      const updated = await repo.updateAll({
        where: { realm: { like: 'HIDDEN_TEST_%' } },
        data: {
          password: 'updated_bulk_password',
          secret: 'updated_bulk_secret',
        },
      });

      if (updated.count === 0) {
        this.context.logger.warn('[CASE 9] SKIPPED | No test users to update');
        return;
      }

      if (!updated.data || updated.data.length === 0) {
        this.context.logger.warn('[CASE 9] SKIPPED | No data returned (shouldReturn may be false)');
        return;
      }

      let hasFailed = false;
      for (const user of updated.data) {
        const userKeys = Object.keys(user);
        const hasPassword = userKeys.includes('password');
        const hasSecret = userKeys.includes('secret');

        if (hasPassword || hasSecret) {
          hasFailed = true;
          this.context.logger.error(
            '[CASE 9] FAILED | User %s has hidden fields in updateAll response',
            user.id,
          );
        }
      }

      if (!hasFailed) {
        this.context.logger.info(
          '[CASE 9] PASSED | UpdateAll excludes hidden from all %d records',
          updated.count,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: DeleteById excludes hidden properties from response
  // ----------------------------------------------------------------
  async case10DeleteByIdExcludesHidden(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase('[CASE 10] DeleteById should exclude hidden properties from response');

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
        this.context.logger.error('[CASE 10] FAILED | Expected 1 record deleted');
        return;
      }

      const deletedKeys = Object.keys(deleted.data);
      const hasPassword = deletedKeys.includes('password');
      const hasSecret = deletedKeys.includes('secret');

      if (hasPassword || hasSecret) {
        this.context.logger.error(
          '[CASE 10] FAILED | DeleteById response has hidden fields | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else {
        this.context.logger.info(
          '[CASE 10] PASSED | DeleteById excludes hidden fields | id: %s',
          deleted.data.id,
        );
        this.context.logger.info('[CASE 10] Response keys: %s', deletedKeys.join(', '));
      }
    } catch (error) {
      this.context.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: Update ONLY hidden fields - should work but response excludes them
  // ----------------------------------------------------------------
  async case19UpdateOnlyHiddenFields(): Promise<void> {
    const repo = this.context.userRepository;
    this.context.logCase(
      '[CASE 19] Update ONLY hidden fields - should work but exclude from response',
    );

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
        this.context.logger.error('[CASE 19] FAILED | Update response has hidden fields');
        return;
      }

      if (updated.data.realm !== originalRealm) {
        this.context.logger.error('[CASE 19] FAILED | Non-hidden field changed unexpectedly');
        return;
      }

      const connector = repo.connector;
      const directResult = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, userId));

      if (directResult.length === 0) {
        this.context.logger.error('[CASE 19] FAILED | User not found via connector');
        return;
      }

      const dbUser = directResult[0];
      if (dbUser.password === 'new_password_only' && dbUser.secret === 'new_secret_only') {
        this.context.logger.info(
          '[CASE 19] PASSED | Hidden fields updated but excluded from response',
        );
        this.context.logger.info(
          '[CASE 19] DB password: %s | DB secret: %s',
          dbUser.password,
          dbUser.secret,
        );
      } else {
        this.context.logger.error(
          '[CASE 19] FAILED | Hidden fields not updated | password: %s | secret: %s',
          dbUser.password,
          dbUser.secret,
        );
      }
    } catch (error) {
      this.context.logger.error('[CASE 19] FAILED | Error: %s', (error as Error).message);
    }
  }
}
