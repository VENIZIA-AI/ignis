import { eq } from 'drizzle-orm';
import { User } from '../../../models/entities';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// Relations Cases - included relations exclude hidden properties
// ----------------------------------------------------------------
export class RelationsCases extends BaseTestCases {
  // ----------------------------------------------------------------
  // CASE 21: Relation hidden properties - included relations should exclude hidden
  // ----------------------------------------------------------------
  async case21RelationHiddenProperties(): Promise<void> {
    this.context.logCase(
      '[CASE 21] Relations should exclude hidden properties from related entities',
    );

    try {
      const testRealm = 'hidden_relation_test';
      let testUser = await this.context.userRepository.findOne({
        filter: { where: { realm: testRealm } },
      });

      if (!testUser) {
        const created = await this.context.userRepository.create({
          data: {
            realm: testRealm,
            username: 'hidden_relation_user',
            email: 'hidden_relation@test.com',
            password: 'relation_test_password',
            secret: 'relation_test_secret',
          },
        });
        testUser = created.data;
        this.context.logger.info('[CASE 21] Created test user | id: %s', testUser?.id);
      }

      if (!testUser) {
        this.context.logger.warn('[CASE 21] SKIPPED | Could not create test user');
        return;
      }

      const configRepo = this.context.configurationRepository;
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
        this.context.logger.error('[CASE 21] FAILED | Could not create test configuration');
        return;
      }

      this.context.logger.info(
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
        this.context.logger.error('[CASE 21] FAILED | Could not find configuration with creator');
        return;
      }

      const creator = (configWithCreator as any).creator;
      if (!creator) {
        this.context.logger.error('[CASE 21] FAILED | Creator relation not included in result');
        return;
      }

      const creatorKeys = Object.keys(creator);
      const hasPassword = creatorKeys.includes('password');
      const hasSecret = creatorKeys.includes('secret');

      this.context.logger.info('[CASE 21] Creator relation keys: %s', creatorKeys.join(', '));

      if (hasPassword || hasSecret) {
        this.context.logger.error(
          '[CASE 21] FAILED | Creator relation has hidden fields | hasPassword: %s | hasSecret: %s',
          hasPassword,
          hasSecret,
        );
      } else {
        this.context.logger.info('[CASE 21] PASSED | Creator relation excludes hidden fields');
        this.context.logger.info('[CASE 21] Creator id: %s | realm: %s', creator.id, creator.realm);
      }

      const connector = this.context.userRepository.connector;

      const [dbUser] = await connector
        .select()
        .from(User.schema)
        .where(eq(User.schema.id, testUser.id));

      if (
        dbUser?.password === 'relation_test_password' &&
        dbUser?.secret === 'relation_test_secret'
      ) {
        this.context.logger.info('[CASE 21] Verified: Hidden data exists in DB for related user');
      } else {
        this.context.logger.warn('[CASE 21] Warning: Could not verify hidden data in DB');
      }

      await configRepo.deleteById({ id: createdConfig.data.id });
      this.context.logger.info('[CASE 21] Cleaned up test configuration');

      await this.context.userRepository.deleteAll({
        where: { realm: testRealm },
        options: { force: true },
      });
      this.context.logger.info('[CASE 21] Cleaned up test user');
    } catch (error) {
      this.context.logger.error('[CASE 21] FAILED | Error: %s', (error as Error).message);
    }
  }
}
