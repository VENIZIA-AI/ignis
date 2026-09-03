import { BindingKeys, BindingNamespaces, inject, service } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../../repositories';
import { BaseTestService } from '../base-test.service';
import { EdgeCases } from './edge.cases';
import { ScenariosCases } from './scenarios.cases';
import { StrengthsCases } from './strengths.cases';

// ----------------------------------------------------------------
// Row Locking Test Service - Row-level locking (FOR UPDATE) tests
// ----------------------------------------------------------------
@service()
export class RowLockingTestService extends BaseTestService {
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
      RowLockingTestService.name,
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
    const strengthsCases = new StrengthsCases(context);
    const scenariosCases = new ScenariosCases(context);
    const edgeCases = new EdgeCases(context);

    this.logSection('[RowLockingTestService] Starting row-level locking test cases...');

    await strengthsCases.case1BasicForUpdate();
    await strengthsCases.case2ForUpdateWithFind();
    await strengthsCases.case3ForUpdateWithFindById();
    await strengthsCases.case4ForShareLock();
    await strengthsCases.case5ForNoKeyUpdate();
    await strengthsCases.case6ForKeyShare();
    await scenariosCases.case7ForUpdateSkipLocked();
    await scenariosCases.case8ForUpdateNoWait();
    await edgeCases.case9LockWithoutTransactionThrows();
    await edgeCases.case10LockWithIncludeThrows();
    await edgeCases.case11LockWithFieldsThrows();
    await scenariosCases.case12LockAndUpdateInTransaction();
    await scenariosCases.case13MultipleReposWithLock();
    await scenariosCases.case14SharedLockAllowsConcurrentReaders();
    await edgeCases.case15LockStrengthsConstants();

    this.logSection('[RowLockingTestService] All row-level locking test cases completed!');
  }
}
