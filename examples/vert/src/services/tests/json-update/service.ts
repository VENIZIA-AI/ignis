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
import { IntegrityCases } from './integrity.cases';
import { MultiPathCases } from './multi-path.cases';
import { PathsCases } from './paths.cases';

// ----------------------------------------------------------------
// JSON Update Test Service - Tests nested JSON/JSONB field updates
// Uses ConfigurationRepository which has the jValue JSONB column
// ----------------------------------------------------------------
export class JsonUpdateTestService extends BaseTestService {
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
      JsonUpdateTestService.name,
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
    const pathsCases = new PathsCases(context);
    const multiPathCases = new MultiPathCases(context);
    const integrityCases = new IntegrityCases(context);
    const edgeCases = new EdgeCases(context);

    this.logSection('[JsonUpdateTestService] Starting JSON path update test cases');

    // Baseline tests (normal column updates)
    await pathsCases.case1UpdateByIdNormalColumns();

    // Simple JSON path updates
    await pathsCases.case2UpdateByIdSimpleJsonPath();
    await pathsCases.case3UpdateByIdNestedJsonPath();
    await pathsCases.case4UpdateByIdArrayIndexPath();

    // Multiple paths
    await multiPathCases.case5UpdateByIdMultiplePathsSameColumn();
    await multiPathCases.case6UpdateByIdMultiplePaths();
    await multiPathCases.case7UpdateByIdMixedRegularAndJsonPaths();

    // Value types
    await integrityCases.case8JsonPathDifferentValueTypes();

    // Sibling preservation
    await integrityCases.case9SiblingFieldsNotAffected();

    // Missing intermediate keys
    await integrityCases.case10CreatesMissingIntermediateKeys();

    // updateAll with JSON paths
    await integrityCases.case11UpdateAllWithJsonPaths();

    // Error handling
    await edgeCases.case12ErrorNonExistentColumn();
    await edgeCases.case13ErrorNonJsonColumn();
    await edgeCases.case14ErrorInvalidPathComponent();

    // Security tests
    await edgeCases.case15SecuritySqlInjectionInPath();
    await edgeCases.case16SecuritySqlInjectionInValue();

    this.logSection('[JsonUpdateTestService] All JSON path update test cases completed');
  }
}
