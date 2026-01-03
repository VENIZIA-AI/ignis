import { BindingKeys, BindingNamespaces, getUID, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../repositories';
import { BaseTestService } from './base-test.service';

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
    this.logSection('[ArrayOperatorTestService] Starting array operator test cases');

    // Basic array operators
    await this.case1_SetupTestData();
    await this.case2_ContainsAllElements();
    await this.case3_ContainsSingleElement();
    await this.case4_ContainsEmptyArray();
    await this.case5_ContainedByArray();
    await this.case6_ContainedByEmptyArray();
    await this.case7_OverlapsWithArray();
    await this.case8_OverlapsNoMatch();
    await this.case9_OverlapsEmptyArray();
    await this.case10_CombinedWithOtherFilters();
    await this.case11_ContainsWithAndOr();

    // Edge cases and advanced scenarios
    await this.case13_LargeArrayContains();
    await this.case14_SpecialCharactersInArray();
    await this.case15_DuplicateElementsInArray();
    await this.case16_CaseSensitivity();
    await this.case17_EmptyStringInArray();
    await this.case18_CombinedArrayOperators();
    await this.case19_ArrayWithNumericLikeStrings();
    await this.case20_ArrayOperatorWithOrderAndLimit();
    await this.case21_NullArrayColumn();

    // Cleanup last
    await this.case12_Cleanup();

    this.logSection('[ArrayOperatorTestService] All array operator test cases completed');
  }

  // ----------------------------------------------------------------
  // CASE 1: Setup test data with array columns
  // ----------------------------------------------------------------
  private async case1_SetupTestData(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 1] Setup test data with array columns');

    try {
      await repo.createAll({
        data: [
          {
            code: `ARRAY_TEST_A_${getUID()}`,
            name: 'Product A',
            description: 'ARRAY_OPERATOR_TEST',
            price: 100,
            tags: ['electronics', 'featured', 'sale'],
          },
          {
            code: `ARRAY_TEST_B_${getUID()}`,
            name: 'Product B',
            description: 'ARRAY_OPERATOR_TEST',
            price: 200,
            tags: ['electronics', 'premium'],
          },
          {
            code: `ARRAY_TEST_C_${getUID()}`,
            name: 'Product C',
            description: 'ARRAY_OPERATOR_TEST',
            price: 300,
            tags: ['clothing', 'featured'],
          },
          {
            code: `ARRAY_TEST_D_${getUID()}`,
            name: 'Product D',
            description: 'ARRAY_OPERATOR_TEST',
            price: 400,
            tags: ['furniture'],
          },
          {
            code: `ARRAY_TEST_E_${getUID()}`,
            name: 'Product E',
            description: 'ARRAY_OPERATOR_TEST',
            price: 500,
            tags: [],
          },
        ],
      });

      this.logger.info('[CASE 1] PASSED | Created 5 products with array tags');
    } catch (error) {
      this.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: Contains - array contains all specified elements
  // ----------------------------------------------------------------
  private async case2_ContainsAllElements(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 2] Contains: tags @> [electronics, featured]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['electronics', 'featured'] },
          } as any,
        },
      });

      if (results.length === 1 && results[0].name === 'Product A') {
        this.logger.info('[CASE 2] PASSED | Found 1 product with both electronics AND featured');
        this.logger.info('[CASE 2] Product: %s | Tags: %j', results[0].name, results[0].tags);
      } else {
        this.logger.error('[CASE 2] FAILED | Expected 1 product | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: Contains - single element
  // ----------------------------------------------------------------
  private async case3_ContainsSingleElement(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 3] Contains: tags @> [featured]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['featured'] },
          } as any,
        },
      });

      if (results.length === 2) {
        const names = results.map(r => r.name).sort();
        if (names.includes('Product A') && names.includes('Product C')) {
          this.logger.info('[CASE 3] PASSED | Found 2 products with featured tag');
          this.logger.info('[CASE 3] Products: %j', names);
        } else {
          this.logger.error('[CASE 3] FAILED | Wrong products returned');
        }
      } else {
        this.logger.error('[CASE 3] FAILED | Expected 2 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: Contains - empty array (everything contains empty set)
  // ----------------------------------------------------------------
  private async case4_ContainsEmptyArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 4] Contains: tags @> [] (empty array)');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: [] },
          } as any,
        },
      });

      // Everything contains empty set, so should return all 5 products
      if (results.length === 5) {
        this.logger.info('[CASE 4] PASSED | All 5 products contain empty set');
      } else {
        this.logger.error('[CASE 4] FAILED | Expected 5 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: ContainedBy - array is subset of provided elements
  // ----------------------------------------------------------------
  private async case5_ContainedByArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 5] ContainedBy: tags <@ [electronics, featured, sale, premium]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { containedBy: ['electronics', 'featured', 'sale', 'premium'] },
          } as any,
        },
      });

      // Product A: [electronics, featured, sale] ⊆ superset ✓
      // Product B: [electronics, premium] ⊆ superset ✓
      // Product E: [] ⊆ superset ✓ (empty is subset of everything)
      if (results.length === 3) {
        const names = results.map(r => r.name).sort();
        this.logger.info('[CASE 5] PASSED | Found 3 products that are subsets');
        this.logger.info('[CASE 5] Products: %j', names);
      } else {
        this.logger.error('[CASE 5] FAILED | Expected 3 products | Got: %d', results.length);
        this.logger.error(
          '[CASE 5] Products: %j',
          results.map(r => ({ name: r.name, tags: r.tags })),
        );
      }
    } catch (error) {
      this.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: ContainedBy - empty array (only empty arrays match)
  // ----------------------------------------------------------------
  private async case6_ContainedByEmptyArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 6] ContainedBy: tags <@ [] (only empty matches)');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { containedBy: [] },
          } as any,
        },
      });

      // Only Product E has empty tags
      if (results.length === 1 && results[0].name === 'Product E') {
        this.logger.info('[CASE 6] PASSED | Found 1 product with empty tags');
        this.logger.info('[CASE 6] Product: %s | Tags: %j', results[0].name, results[0].tags);
      } else {
        this.logger.error('[CASE 6] FAILED | Expected 1 product | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Overlaps - shares any element
  // ----------------------------------------------------------------
  private async case7_OverlapsWithArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 7] Overlaps: tags && [premium, clothing]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { overlaps: ['premium', 'clothing'] },
          } as any,
        },
      });

      // Product B: has premium ✓
      // Product C: has clothing ✓
      if (results.length === 2) {
        const names = results.map(r => r.name).sort();
        if (names.includes('Product B') && names.includes('Product C')) {
          this.logger.info('[CASE 7] PASSED | Found 2 products with overlapping tags');
          this.logger.info('[CASE 7] Products: %j', names);
        } else {
          this.logger.error('[CASE 7] FAILED | Wrong products returned');
        }
      } else {
        this.logger.error('[CASE 7] FAILED | Expected 2 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Overlaps - no matching elements
  // ----------------------------------------------------------------
  private async case8_OverlapsNoMatch(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 8] Overlaps: tags && [nonexistent]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { overlaps: ['nonexistent'] },
          } as any,
        },
      });

      if (results.length === 0) {
        this.logger.info('[CASE 8] PASSED | No products with nonexistent tag');
      } else {
        this.logger.error('[CASE 8] FAILED | Expected 0 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Overlaps - empty array (no overlap possible)
  // ----------------------------------------------------------------
  private async case9_OverlapsEmptyArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 9] Overlaps: tags && [] (empty array)');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { overlaps: [] },
          } as any,
        },
      });

      // Empty array overlaps with nothing
      if (results.length === 0) {
        this.logger.info('[CASE 9] PASSED | Empty array overlaps with nothing');
      } else {
        this.logger.error('[CASE 9] FAILED | Expected 0 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Combined with other filters
  // ----------------------------------------------------------------
  private async case10_CombinedWithOtherFilters(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 10] Combined: price > 150 AND tags contains [featured]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            price: { gt: 150 },
            tags: { contains: ['featured'] },
          } as any,
        },
      });

      // Product A: price=100 (no), Product C: price=300 with featured ✓
      if (results.length === 1 && results[0].name === 'Product C') {
        this.logger.info('[CASE 10] PASSED | Found 1 product with price > 150 and featured');
        this.logger.info(
          '[CASE 10] Product: %s | Price: %d | Tags: %j',
          results[0].name,
          results[0].price,
          results[0].tags,
        );
      } else {
        this.logger.error('[CASE 10] FAILED | Expected 1 product | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Contains with AND/OR
  // ----------------------------------------------------------------
  private async case11_ContainsWithAndOr(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 11] OR: tags contains [electronics] OR tags contains [furniture]');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            or: [{ tags: { contains: ['electronics'] } }, { tags: { contains: ['furniture'] } }],
          } as any,
        },
      });

      // Product A: electronics ✓, Product B: electronics ✓, Product D: furniture ✓
      if (results.length === 3) {
        const names = results.map(r => r.name).sort();
        this.logger.info('[CASE 11] PASSED | Found 3 products with electronics OR furniture');
        this.logger.info('[CASE 11] Products: %j', names);
      } else {
        this.logger.error('[CASE 11] FAILED | Expected 3 products | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Large Array Contains (100+ elements)
  // ----------------------------------------------------------------
  private async case13_LargeArrayContains(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 13] Large array with 100+ elements');

    try {
      // Create product with large array
      const largeTags = Array.from({ length: 100 }, (_, i) => `tag_${i}`);
      largeTags.push('special_tag'); // Add a specific tag we'll search for

      await repo.create({
        data: {
          code: `ARRAY_LARGE_${getUID()}`,
          name: 'Large Array Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 999,
          tags: largeTags,
        },
      });

      // Search for specific tag in large array
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['special_tag'] },
          } as any,
        },
      });

      const found = results.find(r => r.name === 'Large Array Product');
      if (found && found.tags?.length === 101) {
        this.logger.info('[CASE 13] PASSED | Found product with 101 tags');
      } else {
        this.logger.error(
          '[CASE 13] FAILED | Expected product with 101 tags | Got: %d',
          found?.tags?.length,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 13] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: Special Characters in Array Elements
  // ----------------------------------------------------------------
  private async case14_SpecialCharactersInArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 14] Special characters in array elements');

    try {
      const specialTags = [
        'tag-with-dash',
        'tag_with_underscore',
        'tag.with.dots',
        'tag with spaces',
        'tag/with/slashes',
        'täg-wïth-ünicödé',
        '日本語タグ',
        'emoji🎉tag',
      ];

      await repo.create({
        data: {
          code: `ARRAY_SPECIAL_${getUID()}`,
          name: 'Special Chars Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 888,
          tags: specialTags,
        },
      });

      // Search for unicode tag
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['日本語タグ'] },
          } as any,
        },
      });

      const found = results.find(r => r.name === 'Special Chars Product');
      if (found) {
        this.logger.info('[CASE 14] PASSED | Found product with unicode tag');
      } else {
        this.logger.error('[CASE 14] FAILED | Could not find product with unicode tag');
      }

      // Search for tag with spaces
      const spacesResults = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['tag with spaces'] },
          } as any,
        },
      });

      const foundSpaces = spacesResults.find(r => r.name === 'Special Chars Product');
      if (foundSpaces) {
        this.logger.info('[CASE 14] PASSED | Found product with spaces in tag');
      } else {
        this.logger.error('[CASE 14] FAILED | Could not find product with spaces in tag');
      }
    } catch (error) {
      this.logger.error('[CASE 14] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: Duplicate Elements in Array
  // ----------------------------------------------------------------
  private async case15_DuplicateElementsInArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 15] Duplicate elements in array');

    try {
      // Create product with duplicate tags
      const product = await repo.create({
        data: {
          code: `ARRAY_DUP_${getUID()}`,
          name: 'Duplicate Tags Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 777,
          tags: ['dup_tag', 'dup_tag', 'dup_tag', 'unique_tag'],
        },
      });

      // Verify the array stores duplicates
      const found = await repo.findById({ id: product.data.id });
      const dupCount = found?.tags?.filter(t => t === 'dup_tag').length || 0;

      if (dupCount === 3) {
        this.logger.info(
          '[CASE 15] PASSED | Array stores duplicate elements (count: %d)',
          dupCount,
        );
      } else if (dupCount === 1) {
        this.logger.info('[CASE 15] INFO | Array de-duplicates elements (count: %d)', dupCount);
      } else {
        this.logger.error('[CASE 15] FAILED | Unexpected duplicate count: %d', dupCount);
      }

      // Contains still works with duplicates
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['dup_tag'] },
          } as any,
        },
      });

      const containsResult = results.find(r => r.name === 'Duplicate Tags Product');
      if (containsResult) {
        this.logger.info('[CASE 15] PASSED | Contains works with duplicate elements');
      }
    } catch (error) {
      this.logger.error('[CASE 15] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Case Sensitivity
  // ----------------------------------------------------------------
  private async case16_CaseSensitivity(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 16] Case sensitivity in array operators');

    try {
      await repo.create({
        data: {
          code: `ARRAY_CASE_${getUID()}`,
          name: 'Case Test Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 666,
          tags: ['CamelCase', 'UPPERCASE', 'lowercase', 'MiXeD'],
        },
      });

      // Test exact case match
      const exactMatch = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['CamelCase'] },
          } as any,
        },
      });

      // Test wrong case
      const wrongCase = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['camelcase'] },
          } as any,
        },
      });

      if (exactMatch.find(r => r.name === 'Case Test Product')) {
        this.logger.info('[CASE 16] PASSED | Exact case match works');
      }

      if (!wrongCase.find(r => r.name === 'Case Test Product')) {
        this.logger.info('[CASE 16] PASSED | Array contains is case-sensitive');
      } else {
        this.logger.info('[CASE 16] INFO | Array contains is case-insensitive');
      }
    } catch (error) {
      this.logger.error('[CASE 16] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 17: Empty String in Array
  // ----------------------------------------------------------------
  private async case17_EmptyStringInArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 17] Empty string in array elements');

    try {
      const product = await repo.create({
        data: {
          code: `ARRAY_EMPTY_STR_${getUID()}`,
          name: 'Empty String Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 555,
          tags: ['normal_tag', '', 'another_tag'],
        },
      });

      // Search for empty string
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: [''] },
          } as any,
        },
      });

      const found = results.find(r => r.name === 'Empty String Product');
      if (found) {
        this.logger.info('[CASE 17] PASSED | Can search for empty string in array');
      } else {
        this.logger.info('[CASE 17] INFO | Empty string search did not match');
      }

      // Verify empty string is stored
      const fetched = await repo.findById({ id: product.data.id });
      const hasEmpty = fetched?.tags?.includes('');
      if (hasEmpty) {
        this.logger.info('[CASE 17] PASSED | Empty string is stored in array');
      } else {
        this.logger.info('[CASE 17] INFO | Empty string may be filtered out');
      }
    } catch (error) {
      this.logger.error('[CASE 17] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 18: Combined Array Operators
  // ----------------------------------------------------------------
  private async case18_CombinedArrayOperators(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 18] Combined array operators (AND multiple conditions)');

    try {
      // Create products for testing
      await repo.createAll({
        data: [
          {
            code: `ARRAY_COMBO_1_${getUID()}`,
            name: 'Combo Product 1',
            description: 'ARRAY_OPERATOR_TEST',
            price: 100,
            tags: ['red', 'blue', 'green'],
          },
          {
            code: `ARRAY_COMBO_2_${getUID()}`,
            name: 'Combo Product 2',
            description: 'ARRAY_OPERATOR_TEST',
            price: 200,
            tags: ['red', 'yellow'],
          },
        ],
      });

      // Complex: contains 'red' AND overlaps with ['blue', 'purple']
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            name: { like: 'Combo Product%' },
            and: [{ tags: { contains: ['red'] } }, { tags: { overlaps: ['blue', 'purple'] } }],
          } as any,
        },
      });

      // Only Product 1 should match (has red and blue)
      if (results.length === 1 && results[0].name === 'Combo Product 1') {
        this.logger.info('[CASE 18] PASSED | Combined operators work correctly');
      } else {
        this.logger.error('[CASE 18] FAILED | Expected 1 product | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 18] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: Array with Numeric-like Strings
  // ----------------------------------------------------------------
  private async case19_ArrayWithNumericLikeStrings(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 19] Array with numeric-like strings');

    try {
      const product = await repo.create({
        data: {
          code: `ARRAY_NUMERIC_${getUID()}`,
          name: 'Numeric Strings Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 444,
          tags: ['123', '456.78', '-99', '0', '1e10'],
        },
      });

      // Search for numeric-like string
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['123'] },
          } as any,
        },
      });

      const found = results.find(r => r.name === 'Numeric Strings Product');
      if (found) {
        this.logger.info('[CASE 19] PASSED | Numeric-like strings work in array');
      } else {
        this.logger.error('[CASE 19] FAILED | Could not find product with numeric string');
      }

      // Verify all numeric strings stored correctly
      const fetched = await repo.findById({ id: product.data.id });
      if (fetched?.tags?.length === 5) {
        this.logger.info('[CASE 19] PASSED | All numeric-like strings stored');
      }
    } catch (error) {
      this.logger.error('[CASE 19] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 20: Array Operators with Order and Limit
  // ----------------------------------------------------------------
  private async case20_ArrayOperatorWithOrderAndLimit(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 20] Array operators combined with order and limit');

    try {
      const results = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { overlaps: ['electronics', 'clothing', 'furniture'] },
          } as any,
          order: ['price DESC'],
          limit: 2,
        },
      });

      if (results.length <= 2) {
        this.logger.info('[CASE 20] PASSED | Array filter with limit: %d results', results.length);
        if (results.length > 0) {
          this.logger.info(
            '[CASE 20] First result (highest price): %s ($%d)',
            results[0].name,
            results[0].price,
          );
        }
      } else {
        this.logger.error('[CASE 20] FAILED | Limit not applied | Got: %d', results.length);
      }

      // Verify ordering
      if (results.length >= 2) {
        if (results[0].price >= results[1].price) {
          this.logger.info('[CASE 20] PASSED | Order DESC applied correctly');
        } else {
          this.logger.error('[CASE 20] FAILED | Order not correct');
        }
      }
    } catch (error) {
      this.logger.error('[CASE 20] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 21: Null Array Column
  // ----------------------------------------------------------------
  private async case21_NullArrayColumn(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 21] Null array column handling');

    try {
      // Create product with null tags (if schema allows)
      const product = await repo.create({
        data: {
          code: `ARRAY_NULL_${getUID()}`,
          name: 'Null Tags Product',
          description: 'ARRAY_OPERATOR_TEST',
          price: 333,
          tags: null as any,
        },
      });

      // Verify null is stored
      const fetched = await repo.findById({ id: product.data.id });
      if (fetched?.tags === null) {
        this.logger.info('[CASE 21] PASSED | Null array column stored correctly');
      } else if (Array.isArray(fetched?.tags) && fetched.tags.length === 0) {
        this.logger.info('[CASE 21] INFO | Null converted to empty array');
      } else {
        this.logger.info('[CASE 21] INFO | Null handling: %j', fetched?.tags);
      }

      // Contains on null column should not match - use 'electronics' which EXISTS in other test products
      // This isolates the null array behavior: 'electronics' exists in Product A and B
      const resultsWithExistingTag = await repo.find({
        filter: {
          where: {
            description: 'ARRAY_OPERATOR_TEST',
            tags: { contains: ['electronics'] },
          } as any,
        },
      });

      const nullProductInResults = resultsWithExistingTag.find(r => r.name === 'Null Tags Product');
      const productsWithElectronics = resultsWithExistingTag.filter(
        r => r.tags && r.tags.includes('electronics'),
      );

      // Verify: products with 'electronics' should be found, but null-tags product should NOT
      if (!nullProductInResults && productsWithElectronics.length > 0) {
        this.logger.info(
          '[CASE 21] PASSED | Null array excluded from contains, %d products with electronics found',
          productsWithElectronics.length,
        );
      } else if (nullProductInResults) {
        this.logger.error('[CASE 21] FAILED | Null array product should not match contains');
      } else {
        this.logger.info(
          '[CASE 21] INFO | No electronics products found (may be cleaned up) | null excluded: %s',
          !nullProductInResults,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 21] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Cleanup test data
  // ----------------------------------------------------------------
  private async case12_Cleanup(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 12] Cleanup array operator test data');

    try {
      const deleted = await repo.deleteAll({ where: { description: 'ARRAY_OPERATOR_TEST' } });
      this.logger.info('[CASE 12] PASSED | Deleted %d records', deleted.count);
    } catch (error) {
      this.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }
}
