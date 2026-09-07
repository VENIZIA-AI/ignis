import { BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../../repositories';
import { BaseTestService } from '../base-test.service';
import { CommitCases } from './commit.cases';
import { CompositeCases } from './composite.cases';
import { EdgeCases } from './edge.cases';
import { IsolationCases } from './isolation.cases';
import { RollbackCases } from './rollback.cases';

// ----------------------------------------------------------------
// Transaction Test Service - Transaction handling tests
// ----------------------------------------------------------------
export class TransactionTestService extends BaseTestService {
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
      TransactionTestService.name,
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
    const commitCases = new CommitCases(context);
    const rollbackCases = new RollbackCases(context);
    const isolationCases = new IsolationCases(context);
    const compositeCases = new CompositeCases(context);
    const edgeCases = new EdgeCases(context);

    this.logSection('[TransactionTestService] Starting transaction test cases...');

    // Basic transaction operations
    await commitCases.case1CommitSuccess();
    await rollbackCases.case2RollbackOnError();
    await rollbackCases.case3RollbackExplicit();
    await isolationCases.case4ReadWithinTransaction();
    await commitCases.case5UpdateAndDeleteInTransaction();
    await edgeCases.case6UseInactiveTransactionAfterCommit();
    await edgeCases.case7UseInactiveTransactionAfterRollback();
    await isolationCases.case8IsolationLevelReadCommitted();
    await isolationCases.case9IsolationLevelSerializable();
    await commitCases.case10CreateAllInTransaction();

    // Advanced transaction tests
    await compositeCases.case11MultipleRepositoriesInTransaction();
    await isolationCases.case12ConcurrentTransactionsOnSameData();
    await edgeCases.case13TransactionStateVerification();
    await edgeCases.case14DoubleCommitHandling();
    await edgeCases.case15DoubleRollbackHandling();
    await rollbackCases.case16RollbackVerifiesNoDataPersisted();
    await compositeCases.case17TransactionWithRelatedEntities();
    await isolationCases.case18IsolationLevelRepeatableRead();
    await isolationCases.case19TransactionWithCountAndExists();
    await edgeCases.case20LargeTransactionWithManyOperations();

    this.logSection('[TransactionTestService] All transaction test cases completed!');
  }
}
