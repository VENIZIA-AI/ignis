import { BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../../repositories';
import { BaseTestService } from '../base-test.service';
import { ClauseOptionsCases } from './clause-options.cases';
import { IntegrationCases } from './integration.cases';
import { OverrideCases } from './override.cases';
import { SecurityCases } from './security.cases';
import { WhereCases } from './where.cases';

// ----------------------------------------------------------------
// Default Filter Test Service - Tests default filter functionality
// ----------------------------------------------------------------
export class DefaultFilterTestService extends BaseTestService {
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
      DefaultFilterTestService.name,
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
    const whereCases = new WhereCases(context);
    const overrideCases = new OverrideCases(context);
    const clauseOptionsCases = new ClauseOptionsCases(context);
    const securityCases = new SecurityCases(context);
    const integrationCases = new IntegrationCases(context);

    this.logSection('[DefaultFilterTestService] Starting default filter test cases');

    // Basic default filter tests
    await whereCases.case1DefaultFilterApplied();
    await overrideCases.case2SkipDefaultFilterBypass();
    await whereCases.case3UserFilterMergedWithDefault();
    await overrideCases.case4UserFilterOverridesDefaultSameKey();
    await overrideCases.case5FindOneWithDefaultFilter();
    await overrideCases.case6FindByIdWithDefaultFilter();
    await overrideCases.case7CountWithDefaultFilter();
    await overrideCases.case8ExistsWithDefaultFilter();

    // Edge cases
    await whereCases.case9EmptyUserFilter();
    await whereCases.case10NullValuesInFilter();
    await whereCases.case11OperatorMerging();
    await clauseOptionsCases.case12LimitOverride();
    await clauseOptionsCases.case13OrderPreservation();

    // Security tests
    await securityCases.case14SqlInjectionInFilter();
    await securityCases.case15XssPayloadInFilter();
    await securityCases.case16PrototypePollutionAttempt();
    await securityCases.case17VeryLongStringValues();
    await securityCases.case18SpecialCharacters();

    // Integration tests
    await integrationCases.case19TransactionWithDefaultFilter();
    await integrationCases.case20RelationsWithDefaultFilter();

    // Additional edge cases
    await overrideCases.case21UpdateAllWithDefaultFilter();
    await overrideCases.case22DeleteAllWithDefaultFilter();
    await whereCases.case23AndOrCombinationWithDefaultFilter();
    await clauseOptionsCases.case24DefaultFilterWithFieldSelection();
    await integrationCases.case25ConcurrentQueriesWithDefaultFilter();
    await integrationCases.case26DefaultFilterWithNestedRelations();
    await overrideCases.case27UpdateByIdWithDefaultFilter();
    await whereCases.case28DefaultFilterInvariance();

    // Advanced Security Tests
    await securityCases.case29SqlInjectionInOrderClause();
    await securityCases.case30SqlInjectionInFieldsArray();
    await securityCases.case31SqlInjectionInIncludeRelation();

    // Cleanup
    await this.cleanup();

    this.logSection('[DefaultFilterTestService] All default filter test cases completed!');
  }

  // ----------------------------------------------------------------
  // Cleanup test data
  // ----------------------------------------------------------------
  private async cleanup(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CLEANUP] Removing default filter test data');

    try {
      // Delete all test products with various prefixes
      const prefixes = [
        'DF_TEST_%',
        'DF_MERGE_%',
        'DF_OVERRIDE_%',
        'DF_FINDONE_%',
        'DF_FINDBYID_%',
        'DF_COUNT_%',
        'DF_EXISTS_%',
        'DF_EMPTY_%',
        'DF_NULL_%',
        'DF_OPERATOR_%',
        'DF_LIMIT_%',
        'DF_ORDER_%',
        'DF_XSS_%',
        'DF_LONG_%',
        'DF_SPECIAL_%',
        'DF_TX_%',
        'DF_REL_%',
        'DF_UPDATEALL_%',
        'DF_DELETEALL_%',
        'DF_ANDOR_%',
        'DF_FIELDS_%',
        'DF_CONCURRENT_%',
        'DF_NESTED_%',
        'DF_UPDATEBYID_%',
        'DF_INVARIANCE_%',
        'DF_ORDER_SEC_%',
        'DF_FIELDS_SEC_%',
        'DF_INCLUDE_SEC_%',
      ];

      for (const prefix of prefixes) {
        await repo.deleteAll({
          where: { code: { like: prefix } },
          options: { force: true, shouldSkipDefaultFilter: true },
        });
      }

      this.logger.info('[CLEANUP] PASSED | Test data cleaned up');
    } catch (error) {
      this.logger.error('[CLEANUP] FAILED | Error: %s', (error as Error).message);
    }
  }
}
