import { BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../../repositories';
import { BaseTestService } from '../base-test.service';
import { CompositionCases } from './composition.cases';
import { ContainsCases } from './contains.cases';
import { EdgeCases } from './edge.cases';
import { OverlapsCases } from './overlaps.cases';

// ----------------------------------------------------------------
// Array Operator Test Service - PostgreSQL array column operator tests
// ----------------------------------------------------------------
export class ArrayOperatorTestService extends BaseTestService {
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
      ArrayOperatorTestService.name,
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
    const containsCases = new ContainsCases(context);
    const overlapsCases = new OverlapsCases(context);
    const compositionCases = new CompositionCases(context);
    const edgeCases = new EdgeCases(context);

    this.logSection('[ArrayOperatorTestService] Starting array operator test cases');

    // Basic array operators
    await containsCases.case1SetupTestData();
    await containsCases.case2ContainsAllElements();
    await containsCases.case3ContainsSingleElement();
    await containsCases.case4ContainsEmptyArray();
    await containsCases.case5ContainedByArray();
    await containsCases.case6ContainedByEmptyArray();
    await overlapsCases.case7OverlapsWithArray();
    await overlapsCases.case8OverlapsNoMatch();
    await overlapsCases.case9OverlapsEmptyArray();
    await compositionCases.case10CombinedWithOtherFilters();
    await compositionCases.case11ContainsWithAndOr();

    // Edge cases and advanced scenarios
    await edgeCases.case13LargeArrayContains();
    await edgeCases.case14SpecialCharactersInArray();
    await edgeCases.case15DuplicateElementsInArray();
    await edgeCases.case16CaseSensitivity();
    await edgeCases.case17EmptyStringInArray();
    await compositionCases.case18CombinedArrayOperators();
    await edgeCases.case19ArrayWithNumericLikeStrings();
    await compositionCases.case20ArrayOperatorWithOrderAndLimit();
    await edgeCases.case21NullArrayColumn();

    // Cleanup last
    await edgeCases.case12Cleanup();

    this.logSection('[ArrayOperatorTestService] All array operator test cases completed');
  }
}
