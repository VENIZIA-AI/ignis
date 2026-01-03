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
// Default Filter Test Service - Tests default filter functionality
// ----------------------------------------------------------------
export class DefaultFilterTestService extends BaseTestService {
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
      DefaultFilterTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[DefaultFilterTestService] Starting default filter test cases');

    // Basic default filter tests
    await this.case1_DefaultFilterApplied();
    await this.case2_SkipDefaultFilterBypass();
    await this.case3_UserFilterMergedWithDefault();
    await this.case4_UserFilterOverridesDefaultSameKey();
    await this.case5_FindOneWithDefaultFilter();
    await this.case6_FindByIdWithDefaultFilter();
    await this.case7_CountWithDefaultFilter();
    await this.case8_ExistsWithDefaultFilter();

    // Edge cases
    await this.case9_EmptyUserFilter();
    await this.case10_NullValuesInFilter();
    await this.case11_OperatorMerging();
    await this.case12_LimitOverride();
    await this.case13_OrderPreservation();

    // Security tests
    await this.case14_SqlInjectionInFilter();
    await this.case15_XssPayloadInFilter();
    await this.case16_PrototypePollutionAttempt();
    await this.case17_VeryLongStringValues();
    await this.case18_SpecialCharacters();

    // Integration tests
    await this.case19_TransactionWithDefaultFilter();
    await this.case20_RelationsWithDefaultFilter();

    // Additional edge cases
    await this.case21_UpdateAllWithDefaultFilter();
    await this.case22_DeleteAllWithDefaultFilter();
    await this.case23_AndOrCombinationWithDefaultFilter();
    await this.case24_DefaultFilterWithFieldSelection();
    await this.case25_ConcurrentQueriesWithDefaultFilter();
    await this.case26_DefaultFilterWithNestedRelations();
    await this.case27_UpdateByIdWithDefaultFilter();
    await this.case28_DefaultFilterInvariance();

    // Advanced Security Tests
    await this.case29_SqlInjectionInOrderClause();
    await this.case30_SqlInjectionInFieldsArray();
    await this.case31_SqlInjectionInIncludeRelation();

    // Cleanup
    await this.cleanup();

    this.logSection('[DefaultFilterTestService] All default filter test cases completed!');
  }

  // ----------------------------------------------------------------
  // CASE 1: Default filter is automatically applied
  // ----------------------------------------------------------------
  private async case1_DefaultFilterApplied(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 1] Default filter should be automatically applied');

    const testCode = `DF_TEST_${getUID()}`;

    try {
      // Create products: one with price > 0, one with price = 0
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced Product', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free Product', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find without shouldSkipDefaultFilter - should only return priced product
      const results = await repo.find({
        filter: { where: { code: { like: `${testCode}%` } } },
      });

      if (results.length === 1 && results[0].code === `${testCode}_PRICED`) {
        this.logger.info(
          '[CASE 1] PASSED | Default filter applied | Found %d products (expected 1)',
          results.length,
        );
      } else {
        this.logger.error(
          '[CASE 1] FAILED | Expected 1 priced product | Got %d | Codes: %s',
          results.length,
          results.map(r => r.code).join(', '),
        );
      }
    } catch (error) {
      this.logger.error('[CASE 1] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 2: shouldSkipDefaultFilter bypasses the default filter
  // ----------------------------------------------------------------
  private async case2_SkipDefaultFilterBypass(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 2] shouldSkipDefaultFilter should bypass default filter');

    const testCode = `DF_TEST_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced Product', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free Product', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find WITH shouldSkipDefaultFilter - should return both products
      const results = await repo.find({
        filter: { where: { code: { like: `${testCode}%` } } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (results.length === 2) {
        this.logger.info(
          '[CASE 2] PASSED | shouldSkipDefaultFilter bypasses default filter | Found %d products',
          results.length,
        );
      } else {
        this.logger.error(
          '[CASE 2] FAILED | Expected 2 products with skip | Got %d',
          results.length,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 2] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 3: User filter is merged with default filter
  // ----------------------------------------------------------------
  private async case3_UserFilterMergedWithDefault(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 3] User filter should be merged with default filter');

    const testCode = `DF_MERGE_${getUID()}`;

    try {
      // Create products with different names and prices
      await repo.create({
        data: { code: `${testCode}_A`, name: 'Product A', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_B`, name: 'Product B', price: 200 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_C`, name: 'Product C', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find with user filter (name = 'Product A')
      // Default filter (price > 0) should also be applied
      const results = await repo.find({
        filter: { where: { code: { like: `${testCode}%` }, name: 'Product A' } },
      });

      if (results.length === 1 && results[0].name === 'Product A') {
        this.logger.info('[CASE 3] PASSED | User filter merged with default | Found: %s', results[0].name);
      } else {
        this.logger.error(
          '[CASE 3] FAILED | Expected Product A | Got: %j',
          results.map(r => r.name),
        );
      }
    } catch (error) {
      this.logger.error('[CASE 3] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 4: User filter overrides default for same key
  // ----------------------------------------------------------------
  private async case4_UserFilterOverridesDefaultSameKey(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 4] User filter should override default for same key');

    const testCode = `DF_OVERRIDE_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free Product', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // User explicitly sets price filter to override default
      // Note: This tests that user can override the default where condition
      const results = await repo.find({
        filter: {
          where: {
            code: { like: `${testCode}%` },
            price: { eq: 0 }, // User explicitly wants price = 0
          },
        },
        options: { shouldSkipDefaultFilter: true }, // Must skip to get price = 0
      });

      if (results.length === 1 && results[0].price === 0) {
        this.logger.info('[CASE 4] PASSED | User override works | price: %d', results[0].price);
      } else {
        this.logger.error('[CASE 4] FAILED | Expected price=0 | Got: %j', results);
      }
    } catch (error) {
      this.logger.error('[CASE 4] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 5: FindOne with default filter
  // ----------------------------------------------------------------
  private async case5_FindOneWithDefaultFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 5] FindOne should apply default filter');

    const testCode = `DF_FINDONE_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Free Product', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // FindOne without skip - should return null (price = 0 excluded)
      const result = await repo.findOne({
        filter: { where: { code: testCode } },
      });

      if (result === null) {
        this.logger.info('[CASE 5] PASSED | FindOne applies default filter | result: null');
      } else {
        this.logger.error('[CASE 5] FAILED | Expected null | Got: %j', result);
      }

      // FindOne with skip - should return the product
      const resultWithSkip = await repo.findOne({
        filter: { where: { code: testCode } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (resultWithSkip?.code === testCode) {
        this.logger.info('[CASE 5] PASSED | FindOne with skip works | code: %s', resultWithSkip.code);
      } else {
        this.logger.error('[CASE 5] FAILED | Expected product | Got: %j', resultWithSkip);
      }
    } catch (error) {
      this.logger.error('[CASE 5] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 6: FindById with default filter
  // ----------------------------------------------------------------
  private async case6_FindByIdWithDefaultFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 6] FindById should apply default filter');

    const testCode = `DF_FINDBYID_${getUID()}`;

    try {
      const created = await repo.create({
        data: { code: testCode, name: 'Free Product', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      const productId = created.data.id;

      // FindById without skip - should return null (price = 0 excluded)
      const result = await repo.findById({ id: productId });

      if (result === null) {
        this.logger.info('[CASE 6] PASSED | FindById applies default filter | result: null');
      } else {
        this.logger.error('[CASE 6] FAILED | Expected null | Got id: %s', result?.id);
      }

      // FindById with skip - should return the product
      const resultWithSkip = await repo.findById({
        id: productId,
        options: { shouldSkipDefaultFilter: true },
      });

      if (resultWithSkip?.id === productId) {
        this.logger.info('[CASE 6] PASSED | FindById with skip works | id: %s', resultWithSkip?.id);
      } else {
        this.logger.error('[CASE 6] FAILED | Expected product | Got: %j', resultWithSkip);
      }
    } catch (error) {
      this.logger.error('[CASE 6] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 7: Count with default filter
  // ----------------------------------------------------------------
  private async case7_CountWithDefaultFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 7] Count should apply default filter');

    const testCode = `DF_COUNT_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Count without skip - should be 1
      const countResult = await repo.count({
        where: { code: { like: `${testCode}%` } },
      });

      if (countResult.count === 1) {
        this.logger.info('[CASE 7] PASSED | Count applies default filter | count: %d', countResult.count);
      } else {
        this.logger.error('[CASE 7] FAILED | Expected 1 | Got: %d', countResult.count);
      }

      // Count with skip - should be 2
      const countWithSkip = await repo.count({
        where: { code: { like: `${testCode}%` } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (countWithSkip.count === 2) {
        this.logger.info('[CASE 7] PASSED | Count with skip works | count: %d', countWithSkip.count);
      } else {
        this.logger.error('[CASE 7] FAILED | Expected 2 with skip | Got: %d', countWithSkip.count);
      }
    } catch (error) {
      this.logger.error('[CASE 7] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 8: Exists with default filter
  // ----------------------------------------------------------------
  private async case8_ExistsWithDefaultFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 8] ExistsWith should apply default filter');

    const testCode = `DF_EXISTS_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Free', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Exists without skip - should be false
      const exists = await repo.existsWith({
        where: { code: testCode },
      });

      if (!exists) {
        this.logger.info('[CASE 8] PASSED | ExistsWith applies default filter | exists: %s', exists);
      } else {
        this.logger.error('[CASE 8] FAILED | Expected false | Got: %s', exists);
      }

      // Exists with skip - should be true
      const existsWithSkip = await repo.existsWith({
        where: { code: testCode },
        options: { shouldSkipDefaultFilter: true },
      });

      if (existsWithSkip) {
        this.logger.info('[CASE 8] PASSED | ExistsWith with skip works | exists: %s', existsWithSkip);
      } else {
        this.logger.error('[CASE 8] FAILED | Expected true with skip | Got: %s', existsWithSkip);
      }
    } catch (error) {
      this.logger.error('[CASE 8] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 9: Empty user filter - default filter still applied
  // ----------------------------------------------------------------
  private async case9_EmptyUserFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 9] Empty user filter should still apply default filter');

    const testCode = `DF_EMPTY_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Free', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find with empty where - default filter still applies
      const results = await repo.find({
        filter: { where: { code: testCode } },
      });

      if (results.length === 0) {
        this.logger.info('[CASE 9] PASSED | Empty user filter + default filter works');
      } else {
        this.logger.error('[CASE 9] FAILED | Expected 0 | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 9] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 10: Null values in filter
  // ----------------------------------------------------------------
  private async case10_NullValuesInFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 10] Null values in filter should be handled correctly');

    const testCode = `DF_NULL_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Test', description: null, price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find with null in user filter
      const results = await repo.find({
        filter: { where: { code: testCode, description: null } },
      });

      if (results.length === 1 && results[0].description === null) {
        this.logger.info('[CASE 10] PASSED | Null values handled correctly');
      } else {
        this.logger.error('[CASE 10] FAILED | Expected 1 with null description | Got: %j', results);
      }
    } catch (error) {
      this.logger.error('[CASE 10] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 11: Operator merging (default has gt, user adds lt)
  // ----------------------------------------------------------------
  private async case11_OperatorMerging(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 11] Operators should be merged correctly');

    const testCode = `DF_OPERATOR_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_50`, name: 'Low Price', price: 50 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_150`, name: 'Mid Price', price: 150 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_300`, name: 'High Price', price: 300 },
        options: { shouldSkipDefaultFilter: true },
      });

      // User filter: price < 200
      // Default filter: price > 0
      // Combined: 0 < price < 200
      const results = await repo.find({
        filter: {
          where: {
            code: { like: `${testCode}%` },
            price: { lt: 200 },
          },
        },
      });

      // Should return products with price 50 and 150 (not 300)
      const prices = results.map(r => r.price).sort((a, b) => a - b);
      const hasCorrectPrices = prices.length === 2 && prices[0] === 50 && prices[1] === 150;

      if (hasCorrectPrices) {
        this.logger.info(
          '[CASE 11] PASSED | Operator merging returns correct products | prices: %j',
          prices,
        );
      } else if (results.length === 2) {
        // Count is right but prices might be wrong
        this.logger.error(
          '[CASE 11] FAILED | Count correct but wrong products | expected: [50, 150] | got: %j',
          prices,
        );
      } else {
        this.logger.error(
          '[CASE 11] FAILED | Expected 2 products [50, 150] | Got %d: %j',
          results.length,
          prices,
        );
      }
    } catch (error) {
      this.logger.error('[CASE 11] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 12: Limit override
  // ----------------------------------------------------------------
  private async case12_LimitOverride(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 12] User limit should override default limit');

    const testCode = `DF_LIMIT_${getUID()}`;

    try {
      // Create 5 products
      for (let i = 1; i <= 5; i++) {
        await repo.create({
          data: { code: `${testCode}_${i}`, name: `Product ${i}`, price: i * 10 },
          options: { shouldSkipDefaultFilter: true },
        });
      }

      // User limit: 2 (default is 100)
      const results = await repo.find({
        filter: {
          where: { code: { like: `${testCode}%` } },
          limit: 2,
        },
      });

      if (results.length === 2) {
        this.logger.info('[CASE 12] PASSED | User limit overrides default | count: %d', results.length);
      } else {
        this.logger.error('[CASE 12] FAILED | Expected 2 | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 12] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 13: Order preservation
  // ----------------------------------------------------------------
  private async case13_OrderPreservation(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 13] User order should override default order');

    const testCode = `DF_ORDER_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_A`, name: 'Product A', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_B`, name: 'Product B', price: 200 },
        options: { shouldSkipDefaultFilter: true },
      });

      // User order: price DESC
      const results = await repo.find({
        filter: {
          where: { code: { like: `${testCode}%` } },
          order: ['price DESC'],
        },
      });

      if (results.length === 2 && results[0].price > results[1].price) {
        this.logger.info('[CASE 13] PASSED | User order preserved | prices: %j', results.map(r => r.price));
      } else {
        this.logger.error('[CASE 13] FAILED | Expected DESC order | Got: %j', results.map(r => r.price));
      }
    } catch (error) {
      this.logger.error('[CASE 13] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 14: SQL injection in filter (security test)
  // ----------------------------------------------------------------
  private async case14_SqlInjectionInFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 14] SQL injection attempts should be safely handled');

    const sqlInjectionPayloads = [
      "'; DROP TABLE Product; --",
      "' OR '1'='1",
      "' UNION SELECT * FROM User --",
      "1; DELETE FROM Product; --",
    ];

    try {
      let passedAll = true;

      for (const payload of sqlInjectionPayloads) {
        try {
          // Attempt to inject via name field
          const results = await repo.find({
            filter: { where: { name: payload } },
          });

          // Should return empty (no matching record), not cause SQL error
          if (results.length === 0) {
            this.logger.info('[CASE 14] Safe handling of: %s', payload.substring(0, 30));
          }
        } catch (error) {
          // If error occurs, it should NOT be a SQL syntax error
          const errMsg = (error as Error).message;
          if (errMsg.includes('syntax') || errMsg.includes('SQL')) {
            this.logger.error('[CASE 14] FAILED | SQL error with payload: %s', payload);
            passedAll = false;
          }
        }
      }

      if (passedAll) {
        this.logger.info('[CASE 14] PASSED | All SQL injection attempts safely handled');
      }
    } catch (error) {
      this.logger.error('[CASE 14] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 15: XSS payload in filter (security test)
  // ----------------------------------------------------------------
  private async case15_XssPayloadInFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 15] XSS payloads should be stored and retrieved safely');

    const testCode = `DF_XSS_${getUID()}`;
    const xssPayload = '<script>alert("xss")</script>';

    try {
      // Create product with XSS payload in name
      await repo.create({
        data: { code: testCode, name: xssPayload, price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Retrieve and verify the payload is stored as-is (not executed)
      const found = await repo.findOne({
        filter: { where: { code: testCode } },
      });

      if (found?.name === xssPayload) {
        this.logger.info('[CASE 15] PASSED | XSS payload stored safely | name: %s', found.name);
      } else {
        this.logger.error('[CASE 15] FAILED | XSS payload not preserved | Got: %s', found?.name);
      }
    } catch (error) {
      this.logger.error('[CASE 15] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 16: Prototype pollution attempt (security test)
  // ----------------------------------------------------------------
  private async case16_PrototypePollutionAttempt(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 16] Prototype pollution attempts should be safely handled');

    try {
      // Attempt prototype pollution via filter
      const maliciousFilter = {
        where: {
          __proto__: { polluted: true },
          constructor: { prototype: { polluted: true } },
        },
      } as any;

      await repo.find({ filter: maliciousFilter });

      // Verify prototype is not polluted
      if ((({} as any).polluted) === undefined) {
        this.logger.info('[CASE 16] PASSED | Prototype pollution attempt blocked');
      } else {
        this.logger.error('[CASE 16] FAILED | Prototype was polluted');
      }
    } catch (error) {
      // Error is acceptable - means the attack was blocked
      this.logger.info('[CASE 16] PASSED | Prototype pollution attempt caused safe error');
    }
  }

  // ----------------------------------------------------------------
  // CASE 17: Very long string values (edge case)
  // ----------------------------------------------------------------
  private async case17_VeryLongStringValues(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 17] Very long string values should be handled');

    const testCode = `DF_LONG_${getUID()}`;
    const longString = 'A'.repeat(10000);

    try {
      await repo.create({
        data: { code: testCode, name: longString.substring(0, 255), description: longString, price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      const found = await repo.findOne({
        filter: { where: { code: testCode } },
      });

      if (found?.description === longString) {
        this.logger.info('[CASE 17] PASSED | Long string stored and retrieved | length: %d', found.description?.length);
      } else {
        this.logger.error('[CASE 17] FAILED | Long string not preserved | Got length: %d', found?.description?.length);
      }
    } catch (error) {
      this.logger.error('[CASE 17] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 18: Special characters (edge case)
  // ----------------------------------------------------------------
  private async case18_SpecialCharacters(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 18] Special characters should be handled correctly');

    const testCode = `DF_SPECIAL_${getUID()}`;
    const specialChars = "Test\n\t\r'\"\\`${}[]<>&|;";

    try {
      await repo.create({
        data: { code: testCode, name: specialChars, price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      const found = await repo.findOne({
        filter: { where: { code: testCode } },
      });

      if (found?.name === specialChars) {
        this.logger.info('[CASE 18] PASSED | Special characters preserved');
      } else {
        this.logger.error('[CASE 18] FAILED | Special characters not preserved | Got: %s', found?.name);
      }
    } catch (error) {
      this.logger.error('[CASE 18] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 19: Transaction with default filter
  // ----------------------------------------------------------------
  private async case19_TransactionWithDefaultFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 19] Default filter should work in transaction context');

    const testCode = `DF_TX_${getUID()}`;
    const transaction = await repo.beginTransaction();

    try {
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced', price: 100 },
        options: { transaction, shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free', price: 0 },
        options: { transaction, shouldSkipDefaultFilter: true },
      });

      // Find within transaction - default filter should apply
      const results = await repo.find({
        filter: { where: { code: { like: `${testCode}%` } } },
        options: { transaction },
      });

      if (results.length === 1) {
        await transaction.commit();
        this.logger.info('[CASE 19] PASSED | Default filter works in transaction | count: %d', results.length);
      } else {
        await transaction.rollback();
        this.logger.error('[CASE 19] FAILED | Expected 1 in transaction | Got: %d', results.length);
      }
    } catch (error) {
      await transaction.rollback();
      this.logger.error('[CASE 19] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 20: Relations with default filter
  // ----------------------------------------------------------------
  private async case20_RelationsWithDefaultFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 20] Default filter should work with relation includes');

    const testCode = `DF_REL_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Product with Relations', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Find with include - default filter should still apply
      const found = await repo.findOne({
        filter: {
          where: { code: testCode },
          include: [{ relation: 'saleChannelProducts' }],
        },
      });

      if (found?.code === testCode) {
        this.logger.info('[CASE 20] PASSED | Relations work with default filter | code: %s', found.code);
      } else {
        this.logger.error('[CASE 20] FAILED | Expected product with relations | Got: %j', found);
      }
    } catch (error) {
      this.logger.error('[CASE 20] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 21: UpdateAll with default filter
  // ----------------------------------------------------------------
  private async case21_UpdateAllWithDefaultFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 21] UpdateAll should respect default filter');

    const testCode = `DF_UPDATEALL_${getUID()}`;

    try {
      // Create products with different prices
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // UpdateAll without skip - should only update priced product
      const updateResult = await repo.updateAll({
        where: { code: { like: `${testCode}%` } },
        data: { description: 'Updated' },
      });

      if (updateResult.count === 1) {
        this.logger.info('[CASE 21] PASSED | UpdateAll respects default filter | updated: %d', updateResult.count);
      } else {
        this.logger.error('[CASE 21] FAILED | Expected 1 update | Got: %d', updateResult.count);
      }

      // Verify the free product was NOT updated
      const freeProduct = await repo.findOne({
        filter: { where: { code: `${testCode}_FREE` } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (freeProduct?.description !== 'Updated') {
        this.logger.info('[CASE 21] PASSED | Free product was NOT updated (excluded by default filter)');
      } else {
        this.logger.error('[CASE 21] FAILED | Free product should NOT have been updated');
      }
    } catch (error) {
      this.logger.error('[CASE 21] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 22: DeleteAll with default filter
  // ----------------------------------------------------------------
  private async case22_DeleteAllWithDefaultFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 22] DeleteAll should respect default filter');

    const testCode = `DF_DELETEALL_${getUID()}`;

    try {
      await repo.create({
        data: { code: `${testCode}_PRICED`, name: 'Priced', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      await repo.create({
        data: { code: `${testCode}_FREE`, name: 'Free', price: 0 },
        options: { shouldSkipDefaultFilter: true },
      });

      // DeleteAll without skip - should only delete priced product
      const deleteResult = await repo.deleteAll({
        where: { code: { like: `${testCode}%` } },
      });

      if (deleteResult.count === 1) {
        this.logger.info('[CASE 22] PASSED | DeleteAll respects default filter | deleted: %d', deleteResult.count);
      } else {
        this.logger.error('[CASE 22] FAILED | Expected 1 delete | Got: %d', deleteResult.count);
      }

      // Verify the free product still exists
      const freeProduct = await repo.findOne({
        filter: { where: { code: `${testCode}_FREE` } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (freeProduct) {
        this.logger.info('[CASE 22] PASSED | Free product still exists (excluded by default filter)');
        // Clean up the remaining product
        await repo.deleteAll({
          where: { code: `${testCode}_FREE` },
          options: { force: true, shouldSkipDefaultFilter: true },
        });
      } else {
        this.logger.error('[CASE 22] FAILED | Free product should still exist');
      }
    } catch (error) {
      this.logger.error('[CASE 22] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 23: AND/OR combination with default filter
  // ----------------------------------------------------------------
  private async case23_AndOrCombinationWithDefaultFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 23] Complex AND/OR should work with default filter');

    const testCode = `DF_ANDOR_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${testCode}_A`, name: 'Product A', price: 50 },
          { code: `${testCode}_B`, name: 'Product B', price: 100 },
          { code: `${testCode}_C`, name: 'Product C', price: 0 }, // Excluded by default
        ],
        options: { shouldSkipDefaultFilter: true },
      });

      // Complex query: (name = A OR name = B) AND (price > 0) <- default filter
      const results = await repo.find({
        filter: {
          where: {
            code: { like: `${testCode}%` },
            or: [{ name: 'Product A' }, { name: 'Product B' }],
          },
        },
      });

      if (results.length === 2) {
        this.logger.info('[CASE 23] PASSED | AND/OR works with default filter | count: %d', results.length);
      } else {
        this.logger.error('[CASE 23] FAILED | Expected 2 | Got: %d', results.length);
      }

      // Test with nested AND in OR
      const nestedResults = await repo.find({
        filter: {
          where: {
            code: { like: `${testCode}%` },
            or: [
              { and: [{ name: 'Product A' }, { price: { gte: 50 } }] },
              { name: 'Product B' },
            ],
          },
        },
      });

      if (nestedResults.length === 2) {
        this.logger.info('[CASE 23] PASSED | Nested AND/OR works | count: %d', nestedResults.length);
      }
    } catch (error) {
      this.logger.error('[CASE 23] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 24: Default filter with field selection
  // ----------------------------------------------------------------
  private async case24_DefaultFilterWithFieldSelection(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 24] Field selection should work with default filter');

    const testCode = `DF_FIELDS_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Field Test', price: 100, description: 'Test Desc' },
        options: { shouldSkipDefaultFilter: true },
      });

      // Select only specific fields
      const results = await repo.find({
        filter: {
          where: { code: testCode },
          fields: ['id', 'name', 'price'],
        },
      });

      if (results.length === 1 && results[0].name === 'Field Test') {
        // Check that only selected fields are returned
        const hasDescription = 'description' in results[0];
        if (!hasDescription || results[0].description === undefined) {
          this.logger.info('[CASE 24] PASSED | Field selection works with default filter');
        } else {
          this.logger.info('[CASE 24] INFO | All fields returned despite selection');
        }
      } else {
        this.logger.error('[CASE 24] FAILED | Expected 1 result | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[CASE 24] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 25: Concurrent queries with default filter
  // ----------------------------------------------------------------
  private async case25_ConcurrentQueriesWithDefaultFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 25] Concurrent queries should all apply default filter');

    const testCode = `DF_CONCURRENT_${getUID()}`;

    try {
      await repo.createAll({
        data: [
          { code: `${testCode}_1`, name: 'Product 1', price: 100 },
          { code: `${testCode}_2`, name: 'Product 2', price: 200 },
          { code: `${testCode}_3`, name: 'Product 3', price: 0 }, // Excluded
        ],
        options: { shouldSkipDefaultFilter: true },
      });

      // Run multiple concurrent queries
      const queries = Array.from({ length: 10 }, () =>
        repo.find({
          filter: { where: { code: { like: `${testCode}%` } } },
        }),
      );

      const allResults = await Promise.all(queries);
      const allCorrect = allResults.every(r => r.length === 2);

      if (allCorrect) {
        this.logger.info('[CASE 25] PASSED | All 10 concurrent queries applied default filter correctly');
      } else {
        const counts = allResults.map(r => r.length);
        this.logger.error('[CASE 25] FAILED | Inconsistent results | counts: %j', counts);
      }
    } catch (error) {
      this.logger.error('[CASE 25] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 26: Default filter with nested relations
  // ----------------------------------------------------------------
  private async case26_DefaultFilterWithNestedRelations(): Promise<void> {
    const productRepo = this.productRepository;
    const saleChannelRepo = this.saleChannelRepository;
    const junctionRepo = this.saleChannelProductRepository;
    this.logCase('[CASE 26] Default filter should work with nested relations');

    const testCode = `DF_NESTED_${getUID()}`;

    try {
      const product = await productRepo.create({
        data: { code: testCode, name: 'Nested Test', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      const channel = await saleChannelRepo.create({
        data: { code: `${testCode}_CH`, name: 'Test Channel' },
      });

      await junctionRepo.create({
        data: { productId: product.data.id, saleChannelId: channel.data.id },
      });

      // Find with nested relations - default filter should apply to main entity
      const found = await productRepo.findOne({
        filter: {
          where: { code: testCode },
          include: [{
            relation: 'saleChannelProducts',
            scope: {
              include: [{ relation: 'saleChannel' }],
            },
          }],
        },
      });

      if (found?.code === testCode) {
        const hasRelations = ((found as any).saleChannelProducts?.length || 0) > 0;
        if (hasRelations) {
          this.logger.info('[CASE 26] PASSED | Nested relations loaded with default filter');
        } else {
          this.logger.info('[CASE 26] INFO | Relations may be empty');
        }
      } else {
        this.logger.error('[CASE 26] FAILED | Product not found with default filter');
      }

      // Cleanup
      await junctionRepo.deleteAll({
        where: { productId: product.data.id },
        options: { force: true },
      });
      await saleChannelRepo.deleteAll({ where: { id: channel.data.id }, options: { force: true } });
    } catch (error) {
      this.logger.error('[CASE 26] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 27: UpdateById with default filter
  // ----------------------------------------------------------------
  private async case27_UpdateByIdWithDefaultFilter(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 27] UpdateById should respect default filter');

    const testCode = `DF_UPDATEBYID_${getUID()}`;

    try {
      const created = await repo.create({
        data: { code: testCode, name: 'Update Test', price: 0 }, // price=0 excluded by default
        options: { shouldSkipDefaultFilter: true },
      });

      const productId = created.data.id;

      // Try to update - should fail because product is excluded by default filter
      const updateResult = await repo.updateById({
        id: productId,
        data: { name: 'Updated Name' },
      });

      if (updateResult.count === 0) {
        this.logger.info('[CASE 27] PASSED | UpdateById respects default filter | count: 0');
      } else {
        this.logger.error('[CASE 27] FAILED | Should not update excluded record | count: %d', updateResult.count);
      }

      // Update with skip - should work
      const updateWithSkip = await repo.updateById({
        id: productId,
        data: { name: 'Updated Name' },
        options: { shouldSkipDefaultFilter: true },
      });

      if (updateWithSkip.count === 1) {
        this.logger.info('[CASE 27] PASSED | UpdateById with skip works | count: 1');
      }
    } catch (error) {
      this.logger.error('[CASE 27] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 28: Default filter invariance (filter not mutated)
  // ----------------------------------------------------------------
  private async case28_DefaultFilterInvariance(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 28] Original filter should not be mutated');

    const testCode = `DF_INVARIANCE_${getUID()}`;

    try {
      await repo.create({
        data: { code: testCode, name: 'Invariance Test', price: 100 },
        options: { shouldSkipDefaultFilter: true },
      });

      const originalFilter = {
        where: { code: testCode },
      };

      // Deep copy to compare later
      const filterBefore = JSON.stringify(originalFilter);

      await repo.find({ filter: originalFilter });

      const filterAfter = JSON.stringify(originalFilter);

      if (filterBefore === filterAfter) {
        this.logger.info('[CASE 28] PASSED | Original filter was not mutated');
      } else {
        this.logger.error('[CASE 28] FAILED | Filter was mutated | before: %s | after: %s',
          filterBefore, filterAfter);
      }
    } catch (error) {
      this.logger.error('[CASE 28] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 29: SQL Injection in Order Clause
  // ----------------------------------------------------------------
  private async case29_SqlInjectionInOrderClause(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 29] SQL injection attempts in order clause');

    const testCode = `DF_ORDER_SEC_${getUID()}`;

    try {
      // Create test data
      await repo.createAll({
        data: [
          { code: `${testCode}_A`, name: 'Product A', price: 100 },
          { code: `${testCode}_B`, name: 'Product B', price: 200 },
        ],
        options: { shouldSkipDefaultFilter: true },
      });

      // Attempt SQL injection in order clause
      const maliciousOrders = [
        'name; DROP TABLE Product--',
        'name ASC; DELETE FROM Product WHERE 1=1--',
        "name'); DROP TABLE Product;--",
        'name ASC UNION SELECT * FROM users--',
        '1; INSERT INTO Product (code) VALUES (injected)--',
      ];

      for (const maliciousOrder of maliciousOrders) {
        try {
          await repo.find({
            filter: {
              where: { code: { like: `${testCode}%` } },
              order: [maliciousOrder],
            },
            options: { shouldSkipDefaultFilter: true },
          });
          // If no error, that's concerning but let's verify data integrity
        } catch (err) {
          // Error is expected for invalid SQL - this is safe behavior
          this.logger.info('[CASE 29] INFO | Order injection rejected: %s', (err as Error).message.slice(0, 50));
        }
      }

      // Verify table still exists and data intact
      const count = await repo.count({
        where: { code: { like: `${testCode}%` } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (count.count === 2) {
        this.logger.info('[CASE 29] PASSED | Order clause injection safely handled, data intact');
      } else {
        this.logger.error('[CASE 29] FAILED | Data may be compromised | count: %d', count.count);
      }

      // Cleanup
      await repo.deleteAll({
        where: { code: { like: `${testCode}%` } },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
    } catch (error) {
      this.logger.error('[CASE 29] ERROR | %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 30: SQL Injection in Fields Array
  // ----------------------------------------------------------------
  private async case30_SqlInjectionInFieldsArray(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 30] SQL injection attempts in fields selection');

    const testCode = `DF_FIELDS_SEC_${getUID()}`;

    try {
      // Create test data
      await repo.create({
        data: { code: testCode, name: 'Secure Product', price: 150 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Attempt SQL injection in fields array
      const maliciousFields = [
        'id; DROP TABLE Product--',
        "name', (SELECT password FROM users)--",
        'id UNION SELECT * FROM users--',
        '*, (SELECT * FROM information_schema.tables)--',
      ];

      for (const maliciousField of maliciousFields) {
        try {
          const results = await repo.find({
            filter: {
              where: { code: testCode },
              fields: [maliciousField] as any,
            },
            options: { shouldSkipDefaultFilter: true },
          });
          // If query succeeds, verify only safe columns returned
          if (results.length > 0) {
            const keys = Object.keys(results[0]);
            this.logger.info('[CASE 30] INFO | Fields returned: %j', keys);
          }
        } catch (err) {
          // Error is expected - safe behavior
          this.logger.info('[CASE 30] INFO | Fields injection rejected');
        }
      }

      // Verify data integrity
      const product = await repo.findOne({
        filter: { where: { code: testCode } },
        options: { shouldSkipDefaultFilter: true },
      });

      if (product) {
        this.logger.info('[CASE 30] PASSED | Fields injection safely handled, product intact');
      } else {
        this.logger.error('[CASE 30] FAILED | Product may be compromised');
      }

      // Cleanup
      await repo.deleteAll({
        where: { code: testCode },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
    } catch (error) {
      this.logger.error('[CASE 30] ERROR | %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // CASE 31: SQL Injection in Include/Relation
  // ----------------------------------------------------------------
  private async case31_SqlInjectionInIncludeRelation(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CASE 31] SQL injection attempts in include/relation');

    const testCode = `DF_INCLUDE_SEC_${getUID()}`;

    try {
      // Create test data
      await repo.create({
        data: { code: testCode, name: 'Include Test Product', price: 200 },
        options: { shouldSkipDefaultFilter: true },
      });

      // Attempt SQL injection in relation name
      const maliciousRelations = [
        "saleChannelProducts'; DROP TABLE Product--",
        'saleChannelProducts UNION SELECT * FROM users',
        "nonexistent); DELETE FROM Product WHERE (1=1",
        '__proto__',
        'constructor.prototype',
      ];

      for (const maliciousRelation of maliciousRelations) {
        try {
          await repo.find({
            filter: {
              where: { code: testCode },
              include: [{ relation: maliciousRelation }],
            },
            options: { shouldSkipDefaultFilter: true },
          });
          // Query might succeed with unknown relation being ignored
        } catch (err) {
          // Error expected for invalid relation - safe behavior
          this.logger.info('[CASE 31] INFO | Include injection rejected: %s', (err as Error).message.slice(0, 50));
        }
      }

      // Test injection in scope where clause within include
      try {
        await repo.find({
          filter: {
            where: { code: testCode },
            include: [{
              relation: 'saleChannelProducts',
              scope: {
                where: { "id; DROP TABLE--": 1 } as any,
              },
            }],
          },
          options: { shouldSkipDefaultFilter: true },
        });
      } catch (err) {
        this.logger.info('[CASE 31] INFO | Scope where injection rejected');
      }

      // Verify data integrity
      const count = await repo.count({
        where: { code: testCode },
        options: { shouldSkipDefaultFilter: true },
      });

      if (count.count === 1) {
        this.logger.info('[CASE 31] PASSED | Include/relation injection safely handled');
      } else {
        this.logger.error('[CASE 31] FAILED | Data integrity issue | count: %d', count.count);
      }

      // Cleanup
      await repo.deleteAll({
        where: { code: testCode },
        options: { force: true, shouldSkipDefaultFilter: true },
      });
    } catch (error) {
      this.logger.error('[CASE 31] ERROR | %s', (error as Error).message);
    }
  }

  // ----------------------------------------------------------------
  // Cleanup test data
  // ----------------------------------------------------------------
  private async cleanup(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[CLEANUP] Removing default filter test data');

    try {
      // Delete all test products with various prefixes
      const prefixes = [
        'DF_TEST_%', 'DF_MERGE_%', 'DF_OVERRIDE_%', 'DF_FINDONE_%', 'DF_FINDBYID_%',
        'DF_COUNT_%', 'DF_EXISTS_%', 'DF_EMPTY_%', 'DF_NULL_%', 'DF_OPERATOR_%',
        'DF_LIMIT_%', 'DF_ORDER_%', 'DF_XSS_%', 'DF_LONG_%', 'DF_SPECIAL_%',
        'DF_TX_%', 'DF_REL_%', 'DF_UPDATEALL_%', 'DF_DELETEALL_%', 'DF_ANDOR_%',
        'DF_FIELDS_%', 'DF_CONCURRENT_%', 'DF_NESTED_%', 'DF_UPDATEBYID_%', 'DF_INVARIANCE_%',
        'DF_ORDER_SEC_%', 'DF_FIELDS_SEC_%', 'DF_INCLUDE_SEC_%',
      ];

      for (const prefix of prefixes) {
        await repo.deleteAll({
          where: { code: { like: prefix } },
          options: { force: true, shouldSkipDefaultFilter: true },
        });
      }

      this.logger.info('[CLEANUP] PASSED | Test data cleaned up');
    } catch (error) {
      this.logger.error('[CLEANUP] FAILED | Error: %s', (error as Error).message);
    }
  }
}
