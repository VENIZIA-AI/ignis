import { BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../../repositories';
import { BaseTestService } from '../base-test.service';
import { CreatedByCases } from './created-by.cases';
import { EdgeCases } from './edge.cases';
import { ModifiedByCases } from './modified-by.cases';
import { QueriesCases } from './queries.cases';

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

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    const context = this.caseContext();
    const createdByCases = new CreatedByCases(context);
    const modifiedByCases = new ModifiedByCases(context);
    const queriesCases = new QueriesCases(context);
    const edgeCases = new EdgeCases(context);

    this.logSection('[UserAuditTestService] Starting user audit tracking test cases');

    // CREATE operation tests
    await createdByCases.case1CreateWithExplicitAuditFields();
    await createdByCases.case2CreateWithoutContextNullAuditFields();
    await createdByCases.case3CreateAllBulkAuditFields();

    // UPDATE operation tests
    await modifiedByCases.case4UpdateByIdModifiedByChanges();
    await createdByCases.case5UpdateByIdCreatedByUnchanged();
    await modifiedByCases.case6UpdateAllBulkModifiedByChanges();
    await modifiedByCases.case7UpdateWithDifferentUser();

    // Edge cases
    await edgeCases.case8NullToNonNullAuditFields();
    await queriesCases.case9VerifyAuditFieldsStoredInDatabase();
    await queriesCases.case10FilterByAuditFields();

    // Transaction behavior
    await edgeCases.case11TransactionAuditTracking();
    await edgeCases.case12RollbackAuditTracking();

    // Advanced scenarios
    await modifiedByCases.case13ConcurrentUpdatesModifiedBy();
    await queriesCases.case14AuditFieldsWithRelations();
    await modifiedByCases.case15MultipleSequentialUpdates();
    await edgeCases.case16AuditFieldsDataTypes();
    await queriesCases.case17AuditFieldsInCountAndExists();
    await edgeCases.case18DeleteReturnsAuditFields();

    // Security and edge cases
    await edgeCases.case19AuditFieldInjectionAttempt();
    await edgeCases.case20EmptyStringVsNullAuditFields();

    // Cleanup
    await edgeCases.case21Cleanup();

    this.logSection('[UserAuditTestService] All user audit tracking test cases completed!');
  }
}
