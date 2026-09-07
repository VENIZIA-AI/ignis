import { BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../../repositories';
import { BaseTestService } from '../base-test.service';
import { EdgeCases } from './edge.cases';
import { FilteredCases } from './filtered.cases';
import { NestedCases } from './nested.cases';
import { SingleCases } from './single.cases';

// ----------------------------------------------------------------
// Inclusion Test Service - Many-to-many relationship tests
// ----------------------------------------------------------------
export class InclusionTestService extends BaseTestService {
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
      InclusionTestService.name,
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
    const singleCases = new SingleCases(context);
    const nestedCases = new NestedCases(context);
    const filteredCases = new FilteredCases(context);
    const edgeCases = new EdgeCases(context);

    this.logSection('[InclusionTestService] Starting inclusion test cases (many-to-many)');

    // Basic inclusion tests
    await singleCases.case1SetupAndBasicInclude();
    await singleCases.case2ProductWithSaleChannels();
    await singleCases.case3SaleChannelWithProducts();
    await singleCases.case4JunctionTableWithBothRelations();
    await nestedCases.case5NestedInclusion();

    // Advanced inclusion tests
    await filteredCases.case7ScopedRelationWithFilter();
    await filteredCases.case8ScopedRelationWithOrder();
    await filteredCases.case9ScopedRelationWithLimit();
    await edgeCases.case10EmptyRelationsHandling();
    await edgeCases.case11MultipleRelationsAtSameLevel();
    await filteredCases.case12RelationFieldSelection();
    await nestedCases.case13NestedRelationWithScope();
    await edgeCases.case14FindManyWithInclusions();
    await filteredCases.case15IncludeWithWhereOnParent();

    // Cleanup last
    await edgeCases.case6Cleanup();

    this.logSection('[InclusionTestService] All inclusion test cases completed!');
  }
}
