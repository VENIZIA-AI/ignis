import { BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import { DataTypes, getUID } from '@venizia/ignis-helpers';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../../repositories';
import { BaseTestService } from '../base-test.service';
import { CompositionCases } from './composition.cases';
import { EdgeCases } from './edge.cases';
import { ScenariosCases } from './scenarios.cases';

// ----------------------------------------------------------------
// Advanced Filter Query Test Service
// Complex scenarios, deep nesting, stress tests, and security edge cases
// ----------------------------------------------------------------
export class AdvancedFilterQueryTestService extends BaseTestService {
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
      AdvancedFilterQueryTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  async run(): Promise<void> {
    const context = this.caseContext();
    const compositionCases = new CompositionCases(context);
    const scenariosCases = new ScenariosCases(context);
    const edgeCases = new EdgeCases(context);

    this.logSection('[AdvancedFilterQueryTestService] Starting advanced scenario tests');

    await this.setupData();

    // 1. Real-world Complex Scenarios
    await scenariosCases.testEcommerceProductSearch();
    await scenariosCases.testComplexDateRanges();

    // 2. Logical Complexity & Recursion
    await compositionCases.testComplexLogicalTreeAoBAndCoD();
    await compositionCases.testDeMorgansLawNotAorB();
    await compositionCases.testDeeplyNestedRecursion();
    await compositionCases.testImplicitExplicitLogicMixing();

    // 3. Relation Scoped Filtering
    await scenariosCases.testScopedRelationFiltering();

    // 4. Type Safety & Coercion
    await edgeCases.testTypeCoercionStringToNumber();
    await edgeCases.testTypeSafetyNullToNonNullable();

    // 5. Stress & Security
    await edgeCases.testMassiveArrayInOperator();
    await edgeCases.testMalformedJsonPaths();

    await this.cleanupData();
    this.logSection('[AdvancedFilterQueryTestService] All advanced tests completed');
  }

  // =================================================================
  // SETUP
  // =================================================================
  private async setupData() {
    this.logCase('[SETUP] Creating advanced test dataset');
    const group = 'ADVANCED_TEST';

    try {
      // 1. Products for E-commerce scenarios
      await this.productRepository.createAll({
        data: [
          {
            code: `P_ADV_1_${getUID()}`,
            name: 'Gaming Laptop X1',
            price: 1500,
            tags: ['electronics', 'gaming', 'computer'],
            description: 'High performance gaming laptop',
          },
          {
            code: `P_ADV_2_${getUID()}`,
            name: 'Office Mouse',
            price: 25,
            tags: ['electronics', 'accessory', 'office'],
            description: 'Wireless mouse',
          },
          {
            code: `P_ADV_3_${getUID()}`,
            name: 'Gaming Chair',
            price: 350,
            tags: ['furniture', 'gaming', 'office'],
            description: 'Ergonomic chair',
          },
          {
            code: `P_ADV_4_${getUID()}`,
            name: 'Cheap Monitor',
            price: 120,
            tags: ['electronics', 'monitor', 'office'],
            description: '1080p display',
          },
          {
            code: `P_ADV_5_${getUID()}`,
            name: 'Pro Monitor',
            price: 800,
            tags: ['electronics', 'monitor', 'gaming'],
            description: '4K display',
          },
        ],
      });

      // 2. Configs for JSON/Logic scenarios
      await this.configurationRepository.createAll({
        data: [
          {
            code: `C_ADV_1_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            nValue: 100,
            tValue: 'status_active',
            jValue: {
              spec: { ram: 16, cpu: 'i7' },
              metadata: { created: '2025-01-01', region: 'us-east' },
              tags: ['a', 'b', 'c'],
            },
          },
          {
            code: `C_ADV_2_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            nValue: 200,
            tValue: 'status_pending',
            jValue: {
              spec: { ram: 32, cpu: 'i9' },
              metadata: { created: '2025-02-01', region: 'eu-west' },
              tags: ['b', 'c', 'd'],
            },
          },
          {
            code: `C_ADV_3_${getUID()}`,
            group,
            dataType: DataTypes.JSON,
            nValue: 300,
            tValue: 'status_archived',
            jValue: {
              spec: { ram: 8, cpu: 'i5' },
              metadata: { created: '2024-12-01', region: 'us-west' },
              tags: ['x', 'y'],
            },
          },
        ],
      });

      this.logger.info('[SETUP] PASSED | Created advanced test data');
    } catch (e) {
      this.logger.error('[SETUP] FAILED | %s', (e as Error).message);
    }
  }

  private async cleanupData() {
    this.logCase('[CLEANUP] Removing advanced test data');
    await this.configurationRepository.deleteAll({ where: { group: 'ADVANCED_TEST' } });
    await this.productRepository.deleteAll({ where: { code: { like: 'P_ADV_%' } } });
    // Cleanup junction/channels if needed (handled by cascade or manual cleanup usually)
  }
}
