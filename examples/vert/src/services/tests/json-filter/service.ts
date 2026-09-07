import { BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../../repositories';
import { BaseTestService } from '../base-test.service';
import { ArraysCases } from './arrays.cases';
import { EdgeCases } from './edge.cases';
import { OperatorsCases } from './operators.cases';
import { PathCases } from './path.cases';

// ----------------------------------------------------------------
// JSON Filter Test Service - JSON/JSONB path filtering tests
// ----------------------------------------------------------------
export class JsonFilterTestService extends BaseTestService {
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
      JsonFilterTestService.name,
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
    const pathCases = new PathCases(context);
    const operatorsCases = new OperatorsCases(context);
    const arraysCases = new ArraysCases(context);
    const edgeCases = new EdgeCases(context);

    this.logSection('[JsonFilterTestService] Starting JSON filter test cases');

    await pathCases.case1SetupTestData();
    await pathCases.case2FilterBySimpleJsonField();
    await pathCases.case3FilterByNestedJsonField();
    await arraysCases.case4FilterByArrayIndex();
    await operatorsCases.case5FilterWithNeqOperator();
    await operatorsCases.case6FilterWithGtGteOperators();
    await operatorsCases.case7FilterWithLtLteOperators();
    await operatorsCases.case8FilterWithLikeIlike();
    await arraysCases.case9FilterWithInOperator();
    await arraysCases.case10FilterWithNinOperator();
    await arraysCases.case11FilterWithBetweenOperator();
    await operatorsCases.case12CombinedJsonAndRegularFilter();
    await arraysCases.case13AndWithMultipleJsonPaths();
    await arraysCases.case14OrWithJsonPaths();
    await pathCases.case15NonExistentJsonPath();
    await edgeCases.case16Cleanup();

    // Flaw fix verification tests
    await pathCases.case17KebabCaseJsonKeys();
    await edgeCases.case18PlainObjectEquality();
    await edgeCases.case19EmptyObjectEquality();
    await edgeCases.case20MixedTypeNumericSafety();

    this.logSection('[JsonFilterTestService] All JSON filter test cases completed');
  }
}
