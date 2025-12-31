import { BaseService, BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import {
  AdvancedFilterQueryTestService,
  ArrayOperatorTestService,
  ComprehensiveOperatorTestService,
  CrudTestService,
  FieldSelectionTestService,
  HiddenPropertiesTestService,
  InclusionTestService,
  JsonFilterTestService,
  JsonOrderByTestService,
  TransactionTestService,
} from './tests';

// ----------------------------------------------------------------
// Repository Test Service - Orchestrates all repository test suites
// ----------------------------------------------------------------
export class RepositoryTestService extends BaseService {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: CrudTestService.name,
      }),
    })
    private readonly crudTestService: CrudTestService,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: TransactionTestService.name,
      }),
    })
    private readonly transactionTestService: TransactionTestService,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: JsonOrderByTestService.name,
      }),
    })
    private readonly jsonOrderByTestService: JsonOrderByTestService,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: FieldSelectionTestService.name,
      }),
    })
    private readonly fieldSelectionTestService: FieldSelectionTestService,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: InclusionTestService.name,
      }),
    })
    private readonly inclusionTestService: InclusionTestService,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: HiddenPropertiesTestService.name,
      }),
    })
    private readonly hiddenPropertiesTestService: HiddenPropertiesTestService,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: JsonFilterTestService.name,
      }),
    })
    private readonly jsonFilterTestService: JsonFilterTestService,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: ArrayOperatorTestService.name,
      }),
    })
    private readonly arrayOperatorTestService: ArrayOperatorTestService,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: ComprehensiveOperatorTestService.name,
      }),
    })
    private readonly comprehensiveOperatorTestService: ComprehensiveOperatorTestService,
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: AdvancedFilterQueryTestService.name,
      }),
    })
    private readonly advancedFilterQueryTestService: AdvancedFilterQueryTestService,
  ) {
    super({ scope: RepositoryTestService.name });
  }

  // ----------------------------------------------------------------
  // Run all repository test suites
  // ----------------------------------------------------------------
  async runAllTests(): Promise<void> {
    this.logger.info('='.repeat(80));
    this.logger.info('[RepositoryTestService] Starting all repository test suites...');
    this.logger.info('='.repeat(80));

    await this.runRepositoryTests();
    await this.runTransactionTests();
    await this.runJsonOrderByTests();
    await this.runJsonFilterTests();
    await this.runArrayOperatorTests();
    await this.runFieldSelectionTests();
    await this.runInclusionTests();
    await this.runHiddenPropertiesTests();
    await this.runComprehensiveOperatorTests();
    await this.runAdvancedFilterQueryTests();

    this.logger.info('='.repeat(80));
    this.logger.info('[RepositoryTestService] All repository test suites completed!');
    this.logger.info('='.repeat(80));
  }

  // ----------------------------------------------------------------
  // Individual test suite runners
  // ----------------------------------------------------------------
  async runRepositoryTests(): Promise<void> {
    await this.crudTestService.run();
  }

  async runTransactionTests(): Promise<void> {
    await this.transactionTestService.run();
  }

  async runJsonOrderByTests(): Promise<void> {
    await this.jsonOrderByTestService.run();
  }

  async runJsonFilterTests(): Promise<void> {
    await this.jsonFilterTestService.run();
  }

  async runArrayOperatorTests(): Promise<void> {
    await this.arrayOperatorTestService.run();
  }

  async runFieldSelectionTests(): Promise<void> {
    await this.fieldSelectionTestService.run();
  }

  async runInclusionTests(): Promise<void> {
    await this.inclusionTestService.run();
  }

  async runHiddenPropertiesTests(): Promise<void> {
    await this.hiddenPropertiesTestService.run();
  }

  async runComprehensiveOperatorTests(): Promise<void> {
    await this.comprehensiveOperatorTestService.run();
  }

  async runAdvancedFilterQueryTests(): Promise<void> {
    await this.advancedFilterQueryTestService.run();
  }
}
