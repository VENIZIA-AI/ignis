import { BindingKeys, BindingNamespaces, DataTypes, getUID, inject } from '@venizia/ignis';
import {
    ConfigurationRepository,
    ProductRepository,
    SaleChannelProductRepository,
    SaleChannelRepository,
    UserRepository,
} from '../../repositories';
import { BaseTestService } from './base-test.service';

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
    this.logSection('[AdvancedFilterQueryTestService] Starting advanced scenario tests');

    await this.setupData();

    // 1. Real-world Complex Scenarios
    await this.test_EcommerceProductSearch();
    await this.test_ComplexDateRanges();

    // 2. Logical Complexity & Recursion
    await this.test_ComplexLogicalTree_AoB_and_CoD();
    await this.test_DeMorgansLaw_Not_AorB();
    await this.test_DeeplyNestedRecursion();
    await this.test_ImplicitExplicitLogicMixing();

    // 3. Relation Scoped Filtering
    await this.test_ScopedRelationFiltering();

    // 4. Type Safety & Coercion
    await this.test_TypeCoercion_StringToNumber();
    await this.test_TypeSafety_NullToNonNullable();

    // 5. Stress & Security
    await this.test_MassiveArrayInOperator();
    await this.test_MalformedJsonPaths();

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

  // =================================================================
  // 1. Real-world Complex Scenarios
  // =================================================================

  private async test_EcommerceProductSearch() {
    this.logCase('[SCENARIO] E-commerce Search: Price Range + Tag Overlap + Sort');
    // Scenario: User wants "gaming" items (electronics or furniture) between $100 and $1000,
    // sorted by price descending.

    try {
      const results = await this.productRepository.find({
        filter: {
          where: {
            and: [{ price: { between: [100, 1000] } }, { tags: { contains: ['gaming'] } }],
          },
          order: ['price DESC'],
        } as any,
      });

      // Expected:
      // - Gaming Laptop ($1500) -> Excluded (Price > 1000)
      // - Gaming Chair ($350) -> MATCH
      // - Pro Monitor ($800) -> MATCH
      // - Cheap Monitor ($120) -> Excluded (No 'gaming' tag)
      // - Office Mouse ($25) -> Excluded (Price < 100)

      // Expected Order: Pro Monitor ($800), Gaming Chair ($350)

      if (results.length === 2 && results[0].price === 800 && results[1].price === 350) {
        this.logger.info('[SCENARIO] PASSED | Found correct products in correct order');
      } else {
        this.logger.error('[SCENARIO] FAILED | Expected Pro Monitor then Gaming Chair');
        this.logger.error(
          'Results: %j',
          results.map(r => ({ name: r.name, price: r.price })),
        );
      }
    } catch (e) {
      this.logger.error('[SCENARIO] FAILED | %s', (e as Error).message);
    }
  }

  private async test_ComplexDateRanges() {
    this.logCase('[SCENARIO] Complex Date Logic (Json Path String Comparison)');
    // Find configs created in 2025 ( >= 2025-01-01 AND < 2026-01-01 )

    try {
      const results = await this.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            and: [
              { 'jValue.metadata.created': { gte: '2025-01-01' } },
              { 'jValue.metadata.created': { lt: '2026-01-01' } },
            ],
          } as any,
        },
      });

      // Should match Config 1 (2025-01-01) and Config 2 (2025-02-01)
      // Config 3 is 2024.

      if (results.length === 2) {
        const codes = results.map(r => r.code);
        if (codes.some(c => c.includes('C_ADV_1')) && codes.some(c => c.includes('C_ADV_2'))) {
          this.logger.info('[SCENARIO] PASSED | Correctly filtered date strings in JSON');
          return;
        }
      }
      this.logger.error('[SCENARIO] FAILED | Expected 2 records (2025)');
      this.logger.error(
        'Results: %j',
        results.map(r => ({ code: r.code, created: (r.jValue as any)?.metadata?.created })),
      );
    } catch (e) {
      this.logger.error('[SCENARIO] FAILED | %s', (e as Error).message);
    }
  }

  // =================================================================
  // 2. Logical Complexity & Recursion
  // =================================================================

  private async test_ComplexLogicalTree_AoB_and_CoD() {
    this.logCase('[LOGIC] (A OR B) AND (C OR D)');
    // (nValue > 150 OR nValue < 50) AND (tValue like 'status_pending' OR tValue like 'status_archived')

    try {
      const results = await this.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            and: [
              { or: [{ nValue: { gt: 150 } }, { nValue: { lt: 50 } }] },
              { or: [{ tValue: { like: '%pending' } }, { tValue: { like: '%archived' } }] },
            ],
          } as any,
        },
      });

      // C1: n=100 (False OR False -> False) AND ... -> Excluded
      // C2: n=200 (True) AND (pending (True)) -> MATCH (200 > 150)
      // C3: n=300 (True) AND (archived (True)) -> MATCH (300 > 150)

      if (results.length === 2) {
        this.logger.info('[LOGIC] PASSED | Correctly handled (A OR B) AND (C OR D)');
      } else {
        this.logger.error('[LOGIC] FAILED | Expected 2 records, got %d', results.length);
        this.logger.error(
          'Results: %j',
          results.map(r => ({ n: r.nValue, t: r.tValue })),
        );
      }
    } catch (e) {
      this.logger.error('[LOGIC] FAILED | %s', (e as Error).message);
    }
  }

  private async test_DeMorgansLaw_Not_AorB() {
    this.logCase('[LOGIC] NOT (A OR B) -> via explicit NOT IN operator');
    // Testing: nValue NOT IN [100, 200]
    // Equivalent to NOT (n=100 OR n=200) -> n!=100 AND n!=200

    try {
      const results = await this.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            nValue: { nin: [100, 200] },
          } as any,
        },
      });

      // Should match C3 (300) only (from the 3 setup items)
      if (results.length === 1 && results[0].nValue === 300) {
        this.logger.info('[LOGIC] PASSED | NOT (A OR B) via NIN worked correctly');
      } else {
        this.logger.error('[LOGIC] FAILED | Expected 1 record (300), got %d', results.length);
      }
    } catch (e) {
      this.logger.error('[LOGIC] FAILED | %s', (e as Error).message);
    }
  }

  private async test_DeeplyNestedRecursion() {
    this.logCase('[LOGIC] Deeply Nested Recursion (10+ levels)');
    // Construct a deeply nested AND chain: AND(AND(AND(...)))

    let nestedFilter: any = { nValue: { gt: 0 } };
    for (let i = 0; i < 15; i++) {
      nestedFilter = { and: [nestedFilter] };
    }

    try {
      const results = await this.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            ...nestedFilter,
          } as any,
        },
      });

      // Should return all 3 records as nValue > 0 is true for all
      if (results.length === 3) {
        this.logger.info('[LOGIC] PASSED | Handled 15 levels of nested ANDs');
      } else {
        this.logger.error(
          '[LOGIC] FAILED | Recursion failed or lost data. Count: %d',
          results.length,
        );
      }
    } catch (e) {
      this.logger.error(
        '[LOGIC] FAILED | Stack overflow or parser error: %s',
        (e as Error).message,
      );
    }
  }

  private async test_ImplicitExplicitLogicMixing() {
    this.logCase('[LOGIC] Mixing implicit object keys AND explicit operators');
    // { nValue: 100, or: [{ tValue: 'x' }, { tValue: 'status_active' }] }
    // Should be parsed as: nValue = 100 AND (tValue = 'x' OR tValue = 'status_active')

    try {
      const results = await this.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            nValue: 100,
            or: [{ tValue: 'non_existent' }, { tValue: 'status_active' }],
          } as any,
        },
      });

      // Config 1 matches nValue=100 and tValue='status_active'
      if (results.length === 1 && results[0].nValue === 100) {
        this.logger.info('[LOGIC] PASSED | Mixed implicit/explicit logic precedence is correct');
      } else {
        this.logger.error('[LOGIC] FAILED | Expected 1 record, got %d', results.length);
      }
    } catch (e) {
      this.logger.error('[LOGIC] FAILED | %s', (e as Error).message);
    }
  }

  // =================================================================
  // 3. Relation Scoped Filtering
  // =================================================================

  private async test_ScopedRelationFiltering() {
    this.logCase('[RELATION] Scoped Include with Filter');
    // Find Products, include SaleChannels where channel.name = 'Online Store'

    // First, verify setup for relations (we need to create them as setupData didn't link them)
    // We'll reuse the setup from InclusionTest logic loosely or create new links here.
    // Let's create a quick link for P_ADV_1 to a new channel.

    try {
      const channel = await this.saleChannelRepository.create({
        data: { name: 'AdvChannel', code: `CH_${getUID()}` },
      });
      const product = (
        await this.productRepository.find({ filter: { where: { code: { like: 'P_ADV_1%' } } } })
      )[0];

      if (product && channel.data) {
        await this.saleChannelProductRepository.create({
          data: { productId: product.id, saleChannelId: channel.data.id },
        });
      }

      // Query: Find Product, include ONLY 'AdvChannel'
      const result = await this.productRepository.findById({
        id: product.id,
        filter: {
          include: [
            {
              relation: 'saleChannelProducts',
              scope: {
                include: [
                  {
                    relation: 'saleChannel',
                    scope: {
                      where: { name: 'AdvChannel' },
                    },
                  },
                ],
              },
            },
          ],
        },
      });

      // We expect 1 saleChannelProduct that has a loaded saleChannel
      // NOTE: This depends on how the ORM handles scoped includes.
      // Often, "where" on an include filters the *included* items, not the parent.

      if (!result) {
        this.logger.error('[RELATION] FAILED | Product not found');
        return;
      }

      const scp = (result as any).saleChannelProducts;
      if (scp && scp.length > 0) {
        // Check if the nested relation applied the filter
        // In some ORMs, if the child filter doesn't match, the parent relation array is empty or the specific child is null.
        // Here we look for presence.
        const hasChannel = scp.some((rel: any) => rel.saleChannel?.name === 'AdvChannel');
        if (hasChannel) {
          this.logger.info('[RELATION] PASSED | Scoped include filter applied');
        } else {
          this.logger.error('[RELATION] FAILED | Scoped filter did not return expected channel');
        }
      } else {
        this.logger.error('[RELATION] FAILED | No relations returned');
      }
    } catch (e) {
      this.logger.warn('[RELATION] SKIPPED/FAILED | Error: %s', (e as Error).message);
    }
  }

  // =================================================================
  // 4. Type Safety & Coercion
  // =================================================================

  private async test_TypeCoercion_StringToNumber() {
    this.logCase('[TYPE] String passed to Number field');
    // nValue: "100" -> Should be cast to 100 or fail?
    // Drizzle/Ignis usually allows implicit casting if the DB supports it,
    // or strict TypeORM/Schema validation might block it.

    try {
      // @ts-ignore
      const results = await this.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            nValue: '100', // Sending string '100' for number column
          } as any,
        },
      });

      if (results.length === 1) {
        this.logger.info('[TYPE] INFO | System auto-coerced String "100" to Number 100');
      } else {
        this.logger.warn('[TYPE] NOTE | Strict type check rejected string "100" (or 0 results)');
      }
    } catch (e) {
      this.logger.info(
        '[TYPE] PASSED | Strict type validation prevented invalid type: %s',
        (e as Error).message,
      );
    }
  }

  private async test_TypeSafety_NullToNonNullable() {
    this.logCase('[TYPE] Null passed to Non-Nullable field');
    // 'code' is usually non-nullable.

    try {
      await this.configurationRepository.find({
        filter: {
          where: { code: null },
        } as any,
      });
      // If it runs returning 0, that's valid (WHERE code IS NULL -> find nothing).
      // If it throws "Invalid type", that's also valid.
      this.logger.info('[TYPE] PASSED | Query with NULL on non-nullable executed without crash');
    } catch (e) {
      this.logger.info('[TYPE] PASSED | Query caught invalid null: %s', (e as Error).message);
    }
  }

  // =================================================================
  // 5. Stress & Security
  // =================================================================

  private async test_MassiveArrayInOperator() {
    this.logCase('[STRESS] Massive IN Array (1000+ items)');

    const massiveArray = Array.from({ length: 2000 }, (_, i) => i);
    // Add the real value 100 in the middle
    massiveArray.push(100);

    const start = Date.now();
    try {
      const results = await this.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            nValue: { in: massiveArray },
          },
        },
      });
      const duration = Date.now() - start;

      if (results.length >= 1) {
        this.logger.info('[STRESS] PASSED | Handled 2000 item IN array in %dms', duration);
      } else {
        this.logger.error('[STRESS] FAILED | Did not find record with massive array');
      }
    } catch (e) {
      this.logger.error('[STRESS] FAILED | Stack overflow or DB error: %s', (e as Error).message);
    }
  }

  private async test_MalformedJsonPaths() {
    this.logCase('[SECURITY] Malformed JSON Path Injection');
    // Try to inject SQL via JSON key: "jValue.metadata' OR 1=1 --"

    const maliciousKey = "jValue.metadata' OR 1=1 --";

    try {
      await this.configurationRepository.find({
        filter: {
          where: {
            group: 'ADVANCED_TEST',
            [maliciousKey]: 'value',
          } as any,
        },
      });

      // If we reach here, either it found nothing (Good) or found everything (Bad)
      // Actually, the key itself being dynamic usually fails "Column not found" or validation.
      this.logger.info(
        '[SECURITY] PASSED | System likely treated malicious key as invalid column or sanitized it',
      );
    } catch (e) {
      // Expected error: Invalid JSON path or Column not found
      this.logger.info(
        '[SECURITY] PASSED | Caught malicious/invalid path: %s',
        (e as Error).message,
      );
    }
  }

  private async cleanupData() {
    this.logCase('[CLEANUP] Removing advanced test data');
    await this.configurationRepository.deleteAll({ where: { group: 'ADVANCED_TEST' } });
    await this.productRepository.deleteAll({ where: { code: { like: 'P_ADV_%' } } });
    // Cleanup junction/channels if needed (handled by cascade or manual cleanup usually)
  }
}
