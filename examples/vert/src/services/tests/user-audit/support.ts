import { getUID } from '@venizia/ignis-helpers';
import { BaseTestCases } from '../base-test.cases';

// ----------------------------------------------------------------
// User Audit Fixture - creates and caches audit-test users by name
// ----------------------------------------------------------------
export class UserAuditFixture extends BaseTestCases {
  // Helper to create test users and get their IDs
  private testUsers: Map<string, string> = new Map();

  async createTestUser(name: string): Promise<string> {
    // Check if already created
    if (this.testUsers.has(name)) {
      return this.testUsers.get(name)!;
    }

    const uniqueId = getUID();
    const result = await this.context.userRepository.create({
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
}

/** Shared by every user-audit case group: one fixture per group, reached through
 * `createTestUser`. */
export abstract class UserAuditCases extends BaseTestCases {
  protected readonly fixture = new UserAuditFixture(this.context);

  protected createTestUser(name: string): Promise<string> {
    return this.fixture.createTestUser(name);
  }
}
