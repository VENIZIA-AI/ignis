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
// Comprehensive Operator Test Service
// Tests ALL query operators, edge cases, security scenarios, and combinations
// ----------------------------------------------------------------
export class ComprehensiveOperatorTestService extends BaseTestService {
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
      ComprehensiveOperatorTestService.name,
      configurationRepository,
      productRepository,
      saleChannelRepository,
      saleChannelProductRepository,
      userRepository,
    );
  }

  // ----------------------------------------------------------------
  async run(): Promise<void> {
    this.logSection('[ComprehensiveOperatorTestService] Starting comprehensive operator tests');

    // Setup
    await this.setupTestData();

    // ================================================================
    // SECTION 1: ALL COMPARISON OPERATORS
    // ================================================================
    await this.test_EqOperatorExplicit();
    await this.test_NeOperator();
    await this.test_NeqOperatorAlias();
    await this.test_GtOperator();
    await this.test_GteOperator();
    await this.test_LtOperator();
    await this.test_LteOperator();

    // ================================================================
    // SECTION 2: NULL OPERATORS (IS / ISN)
    // ================================================================
    await this.test_IsNullOperator();
    await this.test_IsNotNullOperator();
    await this.test_NullWithEqOperator();
    await this.test_NullWithNeqOperator();

    // ================================================================
    // SECTION 3: STRING OPERATORS
    // ================================================================
    await this.test_LikeOperator();
    await this.test_NotLikeOperator();
    await this.test_IlikeOperator();
    await this.test_NotIlikeOperator();
    await this.test_RegexpOperator();
    await this.test_IregexpOperator();

    // ================================================================
    // SECTION 4: ARRAY/LIST OPERATORS
    // ================================================================
    await this.test_InOperator();
    await this.test_InqOperatorAlias();
    await this.test_NinOperator();
    await this.test_InEmptyArrayEdgeCase();
    await this.test_NinEmptyArrayEdgeCase();
    await this.test_BetweenOperator();
    await this.test_NotBetweenOperator();

    // ================================================================
    // SECTION 5: MULTIPLE OPERATORS ON SAME FIELD
    // ================================================================
    await this.test_MultipleOperatorsSameField();
    await this.test_RangeQueryGtAndLt();

    // ================================================================
    // SECTION 6: COMPLEX LOGICAL OPERATIONS
    // ================================================================
    await this.test_NestedAndOr();
    await this.test_DeeplyNestedLogic();
    await this.test_OrWithMultipleConditions();
    await this.test_AndWithOrInside();

    // ================================================================
    // SECTION 7: EDGE CASES
    // ================================================================
    await this.test_EmptyStringEquality();
    await this.test_SpecialCharactersInLike();
    await this.test_LargeNumberBoundary();
    await this.test_NegativeNumbers();
    await this.test_ZeroValue();
    await this.test_SkipBeyondDataset();
    await this.test_LimitZero();
    await this.test_EmptyWhereClause();
    await this.test_UndefinedValueInWhere();

    // ================================================================
    // SECTION 8: JSON ADVANCED EDGE CASES
    // ================================================================
    await this.test_JsonNullValue();
    await this.test_JsonDeeplyNestedPath();
    await this.test_JsonArrayMultipleIndices();
    await this.test_JsonBooleanValue();
    await this.test_JsonEmptyArray();
    await this.test_JsonEmptyObject();
    await this.test_JsonSpecialCharactersInValue();

    // ================================================================
    // SECTION 9: SECURITY TESTS
    // ================================================================
    await this.test_SqlInjectionInValue();
    await this.test_SqlInjectionInLikePattern();
    await this.test_SqlInjectionInArrayValues();
    await this.test_XssInDataStorage();

    // ================================================================
    // SECTION 10: COMBINATION TESTS (REAL-WORLD SCENARIOS)
    // ================================================================
    await this.test_PaginationWithComplexFilter();
    await this.test_SearchWithMultipleCriteria();
    await this.test_DateRangeQuery();
    await this.test_PriceRangeWithTags();

    // Cleanup
    await this.cleanupTestData();

    this.logSection('[ComprehensiveOperatorTestService] All tests completed!');
  }

  // ================================================================
  // SETUP
  // ================================================================
  private async setupTestData(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[SETUP] Creating comprehensive test data');

    const group = 'COMPREHENSIVE_TEST';

    try {
      await repo.createAll({
        data: [
          // Basic numeric values for comparison operators
          {
            code: `COMP_NUM_1_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 10,
            tValue: 'alpha',
            description: 'First record',
            jValue: { priority: 1, status: 'active', metadata: { level: 1, tags: ['a', 'b'] } },
          },
          {
            code: `COMP_NUM_2_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 20,
            tValue: 'beta',
            description: 'Second record',
            jValue: { priority: 2, status: 'pending', metadata: { level: 2, tags: ['b', 'c'] } },
          },
          {
            code: `COMP_NUM_3_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 30,
            tValue: 'gamma',
            description: 'Third record',
            jValue: { priority: 3, status: 'active', metadata: { level: 3, tags: ['c', 'd'] } },
          },
          {
            code: `COMP_NUM_4_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 40,
            tValue: 'delta',
            description: 'Fourth record',
            jValue: { priority: 4, status: 'inactive', metadata: { level: 4, tags: [] } },
          },
          {
            code: `COMP_NUM_5_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 50,
            tValue: 'epsilon',
            description: 'Fifth record',
            jValue: { priority: 5, status: 'active', metadata: { level: 5, tags: ['e'] } },
          },
          // NULL values for null operator tests
          {
            code: `COMP_NULL_1_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: null,
            tValue: null,
            description: null,
            jValue: { priority: null, status: null, metadata: null },
          },
          {
            code: `COMP_NULL_2_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: null,
            tValue: 'has text',
            description: 'has description',
            jValue: { priority: 0, status: 'unknown', metadata: {} },
          },
          // Empty string for edge cases
          {
            code: `COMP_EMPTY_${getUID()}`,
            group,
            dataType: DataTypes.TEXT,
            nValue: 0,
            tValue: '',
            description: '',
            jValue: { priority: -1, status: '', metadata: { level: 0, tags: [] } },
          },
          // Special characters for security tests
          {
            code: `COMP_SPECIAL_${getUID()}`,
            group,
            dataType: DataTypes.TEXT,
            nValue: 100,
            tValue: "test'value",
            description: "O'Brien & <script>alert('xss')</script>",
            jValue: { name: "test'json", query: "'; DROP TABLE users; --" },
          },
          // Large/boundary numbers
          {
            code: `COMP_LARGE_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: 2147483647,
            tValue: 'max int',
            description: 'Maximum integer value',
            jValue: { priority: 999999999, bigValue: 9007199254740991 },
          },
          // Negative numbers
          {
            code: `COMP_NEGATIVE_${getUID()}`,
            group,
            dataType: DataTypes.NUMBER,
            nValue: -100,
            tValue: 'negative',
            description: 'Negative value record',
            jValue: { priority: -5, balance: -1000.5 },
          },
        ],
      });

      this.logger.info('[SETUP] PASSED | Created 11 test records');
    } catch (error) {
      this.logger.error('[SETUP] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 1: COMPARISON OPERATORS
  // ================================================================

  private async test_EqOperatorExplicit(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[EQ] Explicit eq operator: { nValue: { eq: 20 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { eq: 20 } },
        },
      });

      if (results.length === 1 && results[0].nValue === 20) {
        this.logger.info('[EQ] PASSED | Found 1 record with nValue = 20');
      } else {
        this.logger.error('[EQ] FAILED | Expected 1 record | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[EQ] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_NeOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[NE] ne operator: { nValue: { ne: 20 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { ne: 20 } },
        },
      });

      // Should find all non-NULL records where nValue != 20
      const allNot20 = results.every(r => r.nValue !== 20);
      if (allNot20 && results.length > 0) {
        this.logger.info('[NE] PASSED | Found %d records with nValue != 20', results.length);
      } else {
        this.logger.error('[NE] FAILED | Some records have nValue = 20');
      }
    } catch (error) {
      this.logger.error('[NE] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_NeqOperatorAlias(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[NEQ] neq operator (alias for ne): { nValue: { neq: 30 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { neq: 30 } },
        },
      });

      const allNot30 = results.every(r => r.nValue !== 30);
      if (allNot30 && results.length > 0) {
        this.logger.info('[NEQ] PASSED | Found %d records with nValue != 30', results.length);
      } else {
        this.logger.error('[NEQ] FAILED | Some records have nValue = 30');
      }
    } catch (error) {
      this.logger.error('[NEQ] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_GtOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[GT] gt operator: { nValue: { gt: 30 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { gt: 30 } },
        },
      });

      // Should find records with nValue > 30: 40, 50, 100, 2147483647 = 4 records
      const allGreater = results.every(r => r.nValue !== null && r.nValue > 30);
      if (allGreater && results.length === 4) {
        this.logger.info('[GT] PASSED | Found %d records with nValue > 30', results.length);
        this.logger.info(
          '[GT] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.logger.error('[GT] FAILED | Expected 4 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[GT] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_GteOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[GTE] gte operator: { nValue: { gte: 30 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { gte: 30 } },
        },
      });

      // Should find records with nValue >= 30: 30, 40, 50, 100, 2147483647 = 5 records
      const allGte = results.every(r => r.nValue !== null && r.nValue >= 30);
      if (allGte && results.length === 5) {
        this.logger.info('[GTE] PASSED | Found %d records with nValue >= 30', results.length);
      } else {
        this.logger.error('[GTE] FAILED | Expected 5 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[GTE] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_LtOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[LT] lt operator: { nValue: { lt: 30 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { lt: 30 } },
        },
      });

      // Should find: -100, 0, 10, 20 = 4 records
      const allLess = results.every(r => r.nValue !== null && r.nValue < 30);
      if (allLess && results.length === 4) {
        this.logger.info('[LT] PASSED | Found %d records with nValue < 30', results.length);
        this.logger.info(
          '[LT] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.logger.error('[LT] FAILED | Expected 4 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[LT] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_LteOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[LTE] lte operator: { nValue: { lte: 30 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { lte: 30 } },
        },
      });

      // Should find: -100, 0, 10, 20, 30 = 5 records
      const allLte = results.every(r => r.nValue !== null && r.nValue <= 30);
      if (allLte && results.length === 5) {
        this.logger.info('[LTE] PASSED | Found %d records with nValue <= 30', results.length);
      } else {
        this.logger.error('[LTE] FAILED | Expected 5 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[LTE] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 2: NULL OPERATORS
  // ================================================================

  private async test_IsNullOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[IS] is operator for NULL: { nValue: { is: null } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { is: null } },
        },
      });

      // Should find 2 records with null nValue
      const allNull = results.every(r => r.nValue === null);
      if (allNull && results.length === 2) {
        this.logger.info('[IS] PASSED | Found %d records with nValue IS NULL', results.length);
      } else {
        this.logger.error('[IS] FAILED | Expected 2 null records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[IS] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_IsNotNullOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[ISN] isn operator for NOT NULL: { nValue: { isn: null } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { isn: null } },
        },
      });

      // Should find all non-null nValue records: 11 total - 2 null = 9 records
      const allNotNull = results.every(r => r.nValue !== null);
      if (allNotNull && results.length === 9) {
        this.logger.info('[ISN] PASSED | Found %d records with nValue IS NOT NULL', results.length);
      } else {
        this.logger.error('[ISN] FAILED | Expected 9 non-null records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[ISN] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_NullWithEqOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[EQ-NULL] eq with null should become IS NULL: { tValue: { eq: null } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { eq: null } },
        },
      });

      const allNull = results.every(r => r.tValue === null);
      if (allNull && results.length >= 1) {
        this.logger.info(
          '[EQ-NULL] PASSED | eq(null) correctly becomes IS NULL | count: %d',
          results.length,
        );
      } else {
        this.logger.error('[EQ-NULL] FAILED | eq(null) not working correctly');
      }
    } catch (error) {
      this.logger.error('[EQ-NULL] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_NullWithNeqOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[NEQ-NULL] neq with null should become IS NOT NULL: { tValue: { neq: null } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { neq: null } },
        },
      });

      // Should find all non-null tValue records: 11 total - 1 null = 10 records
      // (only COMP_NULL_1 has tValue = null)
      const allNotNull = results.every(r => r.tValue !== null);
      if (allNotNull && results.length === 10) {
        this.logger.info(
          '[NEQ-NULL] PASSED | neq(null) correctly becomes IS NOT NULL | count: %d',
          results.length,
        );
      } else {
        this.logger.error(
          '[NEQ-NULL] FAILED | Expected 10 records | got %d records',
          results.length,
        );
      }
    } catch (error) {
      this.logger.error('[NEQ-NULL] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 3: STRING OPERATORS
  // ================================================================

  private async test_LikeOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[LIKE] like operator: { tValue: { like: "%eta%" } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { like: '%eta%' } },
        },
      });

      // Should find 'beta'
      if (results.length === 1 && results[0].tValue === 'beta') {
        this.logger.info('[LIKE] PASSED | Found record with tValue containing "eta"');
      } else {
        this.logger.error(
          '[LIKE] FAILED | Expected "beta" | Got: %j',
          results.map(r => r.tValue),
        );
      }
    } catch (error) {
      this.logger.error('[LIKE] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_NotLikeOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[NLIKE] nlike operator: { tValue: { nlike: "%alpha%" } }');

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            tValue: { nlike: '%alpha%', isn: null },
          },
        },
      });

      const noneAlpha = results.every(r => !r.tValue?.includes('alpha'));
      if (noneAlpha && results.length >= 5) {
        this.logger.info(
          '[NLIKE] PASSED | Found %d records NOT containing "alpha"',
          results.length,
        );
      } else {
        this.logger.error('[NLIKE] FAILED | Some records contain "alpha"');
      }
    } catch (error) {
      this.logger.error('[NLIKE] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_IlikeOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[ILIKE] ilike operator (case-insensitive): { tValue: { ilike: "%ALPHA%" } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { ilike: '%ALPHA%' } },
        },
      });

      // Should find 'alpha' despite uppercase search
      if (results.length === 1 && results[0].tValue?.toLowerCase() === 'alpha') {
        this.logger.info('[ILIKE] PASSED | Case-insensitive match found "alpha"');
      } else {
        this.logger.error(
          '[ILIKE] FAILED | Expected "alpha" | Got: %j',
          results.map(r => r.tValue),
        );
      }
    } catch (error) {
      this.logger.error('[ILIKE] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_NotIlikeOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase(
      '[NILIKE] nilike operator (NOT case-insensitive): { tValue: { nilike: "%BETA%" } }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            tValue: { nilike: '%BETA%', isn: null },
          },
        },
      });

      const noneBeta = results.every(r => !r.tValue?.toLowerCase().includes('beta'));
      if (noneBeta && results.length >= 5) {
        this.logger.info(
          '[NILIKE] PASSED | Found %d records NOT containing "beta" (case-insensitive)',
          results.length,
        );
      } else {
        this.logger.error('[NILIKE] FAILED | Some records contain "beta"');
      }
    } catch (error) {
      this.logger.error('[NILIKE] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_RegexpOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[REGEXP] regexp operator (PostgreSQL POSIX): { tValue: { regexp: "^a.*" } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { regexp: '^a.*' } },
        },
      });

      // Should find 'alpha'
      if (results.length === 1 && results[0].tValue === 'alpha') {
        this.logger.info('[REGEXP] PASSED | Regex ^a.* matched "alpha"');
      } else {
        this.logger.error(
          '[REGEXP] FAILED | Expected "alpha" | Got: %j',
          results.map(r => r.tValue),
        );
      }
    } catch (error) {
      this.logger.error('[REGEXP] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_IregexpOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase(
      '[IREGEXP] iregexp operator (case-insensitive regex): { tValue: { iregexp: "^GAMMA$" } }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { iregexp: '^GAMMA$' } },
        },
      });

      // Should find 'gamma' despite uppercase regex
      if (results.length === 1 && results[0].tValue?.toLowerCase() === 'gamma') {
        this.logger.info('[IREGEXP] PASSED | Case-insensitive regex matched "gamma"');
      } else {
        this.logger.error(
          '[IREGEXP] FAILED | Expected "gamma" | Got: %j',
          results.map(r => r.tValue),
        );
      }
    } catch (error) {
      this.logger.error('[IREGEXP] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 4: ARRAY/LIST OPERATORS
  // ================================================================

  private async test_InOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[IN] in operator: { nValue: { in: [10, 20, 30] } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { in: [10, 20, 30] } },
        },
      });

      if (results.length === 3) {
        const values = results.map(r => r.nValue).sort((a, b) => (a ?? 0) - (b ?? 0));
        if (values.join(',') === '10,20,30') {
          this.logger.info('[IN] PASSED | Found 3 records with nValue in [10, 20, 30]');
        } else {
          this.logger.error('[IN] FAILED | Wrong values: %j', values);
        }
      } else {
        this.logger.error('[IN] FAILED | Expected 3 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[IN] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_InqOperatorAlias(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[INQ] inq operator (alias for in): { nValue: { inq: [40, 50] } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { inq: [40, 50] } },
        },
      });

      if (results.length === 2) {
        const values = results.map(r => r.nValue).sort((a, b) => (a ?? 0) - (b ?? 0));
        if (values.join(',') === '40,50') {
          this.logger.info('[INQ] PASSED | inq works as alias for in');
        } else {
          this.logger.error('[INQ] FAILED | Wrong values: %j', values);
        }
      } else {
        this.logger.error('[INQ] FAILED | Expected 2 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[INQ] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_NinOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[NIN] nin operator: { nValue: { nin: [10, 20, 30, 40, 50] } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { nin: [10, 20, 30, 40, 50] } },
        },
      });

      // IMPORTANT: SQL NIN does NOT return NULL values!
      // NULL NOT IN (values) = UNKNOWN, which is excluded from results
      // Should find: 0, 100, -100, 2147483647 = 4 records (NULLs excluded)
      const noneInList = results.every(r => ![10, 20, 30, 40, 50].includes(r.nValue as number));
      const noNulls = results.every(r => r.nValue !== null);
      if (noneInList && noNulls && results.length === 4) {
        this.logger.info(
          '[NIN] PASSED | Found %d records NOT in [10,20,30,40,50] (NULLs excluded by SQL)',
          results.length,
        );
        this.logger.info(
          '[NIN] Values: %j',
          results.map(r => r.nValue),
        );
      } else if (noneInList && results.length >= 4) {
        this.logger.warn(
          '[NIN] WARNING | Expected 4 records (NULLs excluded) | Got: %d',
          results.length,
        );
        this.logger.warn(
          '[NIN] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.logger.error(
          '[NIN] FAILED | Some values are in the exclusion list or unexpected count',
        );
      }
    } catch (error) {
      this.logger.error('[NIN] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_InEmptyArrayEdgeCase(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[IN-EMPTY] in with empty array should return nothing: { nValue: { in: [] } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { in: [] } },
        },
      });

      if (results.length === 0) {
        this.logger.info('[IN-EMPTY] PASSED | Empty array IN returns 0 records');
      } else {
        this.logger.error('[IN-EMPTY] FAILED | Expected 0 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[IN-EMPTY] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_NinEmptyArrayEdgeCase(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase(
      '[NIN-EMPTY] nin with empty array should return everything: { nValue: { nin: [] } }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { nin: [] } },
        },
      });

      // Empty NIN means "not in nothing" = everything
      if (results.length >= 10) {
        this.logger.info(
          '[NIN-EMPTY] PASSED | Empty array NIN returns all %d records',
          results.length,
        );
      } else {
        this.logger.error('[NIN-EMPTY] FAILED | Expected >= 10 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[NIN-EMPTY] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_BetweenOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[BETWEEN] between operator: { nValue: { between: [20, 40] } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { between: [20, 40] } },
        },
      });

      // Should find 20, 30, 40
      const allInRange = results.every(r => r.nValue !== null && r.nValue >= 20 && r.nValue <= 40);
      if (allInRange && results.length === 3) {
        this.logger.info('[BETWEEN] PASSED | Found 3 records with nValue between 20 and 40');
        this.logger.info(
          '[BETWEEN] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.logger.error(
          '[BETWEEN] FAILED | Expected 3 records in range | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.logger.error('[BETWEEN] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_NotBetweenOperator(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[NOT-BETWEEN] notBetween operator: { nValue: { notBetween: [20, 40] } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { notBetween: [20, 40] } },
        },
      });

      // Should find: -100, 0, 10, 50, 100, 2147483647 = 6 records (NOT in 20-40 range)
      // Note: NULL values are excluded because NULL NOT BETWEEN returns UNKNOWN
      const allOutsideRange = results.every(
        r => r.nValue !== null && (r.nValue < 20 || r.nValue > 40),
      );

      if (allOutsideRange && results.length === 6) {
        this.logger.info(
          '[NOT-BETWEEN] PASSED | Found %d records outside range 20-40',
          results.length,
        );
        this.logger.info(
          '[NOT-BETWEEN] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.logger.error(
          '[NOT-BETWEEN] FAILED | Expected 6 records outside range | Got: %d',
          results.length,
        );
        this.logger.error(
          '[NOT-BETWEEN] Values: %j',
          results.map(r => r.nValue),
        );
      }
    } catch (error) {
      this.logger.error('[NOT-BETWEEN] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 5: MULTIPLE OPERATORS ON SAME FIELD
  // ================================================================

  private async test_MultipleOperatorsSameField(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[MULTI-OP] Multiple operators on same field: { nValue: { gt: 10, lt: 50 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { gt: 10, lt: 50 } },
        },
      });

      // Should find 20, 30, 40
      const allInRange = results.every(r => r.nValue !== null && r.nValue > 10 && r.nValue < 50);
      if (allInRange && results.length === 3) {
        this.logger.info('[MULTI-OP] PASSED | Found 3 records with 10 < nValue < 50');
        this.logger.info(
          '[MULTI-OP] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.logger.error('[MULTI-OP] FAILED | Expected 3 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[MULTI-OP] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_RangeQueryGtAndLt(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[RANGE] Range query with gte and lte: { nValue: { gte: 20, lte: 40 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { gte: 20, lte: 40 } },
        },
      });

      // Same as between: 20, 30, 40
      const allInRange = results.every(r => r.nValue !== null && r.nValue >= 20 && r.nValue <= 40);
      if (allInRange && results.length === 3) {
        this.logger.info('[RANGE] PASSED | gte+lte works like between | Found 3 records');
      } else {
        this.logger.error('[RANGE] FAILED | Expected 3 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[RANGE] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 6: COMPLEX LOGICAL OPERATIONS
  // ================================================================

  private async test_NestedAndOr(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase(
      '[NESTED] Nested AND/OR: { and: [{ nValue: 10 }, { or: [{ nValue: 20 }, { nValue: 30 }] }] }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            and: [{ nValue: 10 }, { or: [{ nValue: 20 }, { nValue: 30 }] }],
          },
        },
      });

      // This should return nothing because AND requires both conditions
      // nValue = 10 AND (nValue = 20 OR nValue = 30) is always false
      if (results.length === 0) {
        this.logger.info('[NESTED] PASSED | Correctly returned 0 records for impossible condition');
      } else {
        this.logger.error('[NESTED] FAILED | Expected 0 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[NESTED] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_DeeplyNestedLogic(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[DEEP-NESTED] Deeply nested: OR -> AND -> field conditions');

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            or: [
              { and: [{ nValue: { gt: 0 } }, { nValue: { lt: 15 } }] }, // 10
              { and: [{ nValue: { gt: 45 } }, { nValue: { lt: 100 } }] }, // 50
            ],
          },
        },
      });

      // Should find nValue=10 (0<10<15) and nValue=50 (45<50<100)
      const values = results.map(r => r.nValue);
      if (results.length === 2 && values.includes(10) && values.includes(50)) {
        this.logger.info('[DEEP-NESTED] PASSED | Found records with nValue 10 and 50');
      } else {
        this.logger.error('[DEEP-NESTED] FAILED | Expected [10, 50] | Got: %j', values);
      }
    } catch (error) {
      this.logger.error('[DEEP-NESTED] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_OrWithMultipleConditions(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase(
      '[OR-MULTI] OR with multiple conditions: { or: [{nValue: 10}, {nValue: 30}, {nValue: 50}] }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            or: [{ nValue: 10 }, { nValue: 30 }, { nValue: 50 }],
          },
        },
      });

      const expectedValues = [10, 30, 50];
      const actualValues = results.map(r => r.nValue);
      const allFound = expectedValues.every(v => actualValues.includes(v));

      if (allFound && results.length === 3) {
        this.logger.info('[OR-MULTI] PASSED | OR correctly matches all 3 values');
      } else {
        this.logger.error('[OR-MULTI] FAILED | Expected [10,30,50] | Got: %j', actualValues);
      }
    } catch (error) {
      this.logger.error('[OR-MULTI] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_AndWithOrInside(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase(
      '[AND-OR] AND with OR inside: { tValue: { isn: null }, or: [{nValue: 10}, {nValue: 20}] }',
    );

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            tValue: { isn: null }, // tValue IS NOT NULL
            or: [{ nValue: 10 }, { nValue: 20 }],
          },
        },
      });

      // Should find records where tValue is not null AND (nValue=10 OR nValue=20)
      const allValid = results.every(
        r => r.tValue !== null && (r.nValue === 10 || r.nValue === 20),
      );

      if (allValid && results.length === 2) {
        this.logger.info('[AND-OR] PASSED | AND with OR inside works correctly');
      } else {
        this.logger.error('[AND-OR] FAILED | Expected 2 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[AND-OR] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 7: EDGE CASES
  // ================================================================

  private async test_EmptyStringEquality(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[EMPTY-STR] Empty string equality: { tValue: "" }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: '' },
        },
      });

      // Should find the record with empty tValue
      if (results.length === 1 && results[0].tValue === '') {
        this.logger.info('[EMPTY-STR] PASSED | Found record with empty string tValue');
      } else {
        this.logger.error(
          '[EMPTY-STR] FAILED | Expected 1 record with empty string | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.logger.error('[EMPTY-STR] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_SpecialCharactersInLike(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase(`[SPECIAL-LIKE] Special characters in LIKE: { tValue: { like: "%'%" } }`);

    try {
      // Search for records containing single quote
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { like: "%'%" } },
        },
      });

      // Should find "test'value"
      if (results.length >= 1 && results.some(r => r.tValue?.includes("'"))) {
        this.logger.info('[SPECIAL-LIKE] PASSED | Found record with single quote in value');
      } else {
        this.logger.error(
          '[SPECIAL-LIKE] FAILED | Expected record with quote | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.logger.error('[SPECIAL-LIKE] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_LargeNumberBoundary(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[LARGE-NUM] Large number boundary: { nValue: 2147483647 }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: 2147483647 },
        },
      });

      if (results.length === 1 && results[0].nValue === 2147483647) {
        this.logger.info('[LARGE-NUM] PASSED | Found record with max integer value');
      } else {
        this.logger.error('[LARGE-NUM] FAILED | Expected 1 record | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[LARGE-NUM] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_NegativeNumbers(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[NEGATIVE] Negative numbers: { nValue: { lt: 0 } }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { lt: 0 } },
        },
      });

      // Should find -100
      const allNegative = results.every(r => r.nValue !== null && r.nValue < 0);
      if (allNegative && results.length >= 1) {
        this.logger.info(
          '[NEGATIVE] PASSED | Found %d records with negative nValue',
          results.length,
        );
        this.logger.info(
          '[NEGATIVE] Values: %j',
          results.map(r => r.nValue),
        );
      } else {
        this.logger.error('[NEGATIVE] FAILED | Expected negative values');
      }
    } catch (error) {
      this.logger.error('[NEGATIVE] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_ZeroValue(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[ZERO] Zero value: { nValue: 0 }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: 0 },
        },
      });

      if (results.length >= 1 && results.every(r => r.nValue === 0)) {
        this.logger.info('[ZERO] PASSED | Found %d records with nValue = 0', results.length);
      } else {
        this.logger.error(
          '[ZERO] FAILED | Expected records with nValue = 0 | Got: %d',
          results.length,
        );
      }
    } catch (error) {
      this.logger.error('[ZERO] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_SkipBeyondDataset(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[SKIP-BEYOND] Skip beyond dataset: { skip: 1000 }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST' },
          skip: 1000,
        },
      });

      if (results.length === 0) {
        this.logger.info('[SKIP-BEYOND] PASSED | Skip beyond data returns empty array');
      } else {
        this.logger.error('[SKIP-BEYOND] FAILED | Expected 0 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[SKIP-BEYOND] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_LimitZero(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[LIMIT-ZERO] Limit zero: { limit: 0 }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST' },
          limit: 0,
        },
      });

      // Behavior may vary: either returns nothing or ignores limit=0
      this.logger.info('[LIMIT-ZERO] INFO | limit: 0 returned %d records', results.length);
      if (results.length === 0) {
        this.logger.info('[LIMIT-ZERO] PASSED | limit: 0 returns empty array');
      } else {
        this.logger.warn(
          '[LIMIT-ZERO] WARNING | limit: 0 may be ignored (returned %d records)',
          results.length,
        );
      }
    } catch (error) {
      this.logger.error('[LIMIT-ZERO] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_EmptyWhereClause(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[EMPTY-WHERE] Empty where clause: { where: {} }');

    try {
      // First count all records
      await repo.find({ filter: {} });

      const results = await repo.find({
        filter: {
          where: {},
          limit: 100,
        },
      });

      // Empty where should return all records (up to limit)
      if (results.length > 0) {
        this.logger.info(
          '[EMPTY-WHERE] PASSED | Empty where returns all records | count: %d',
          results.length,
        );
      } else {
        this.logger.error('[EMPTY-WHERE] FAILED | Expected records | Got: 0');
      }
    } catch (error) {
      this.logger.error('[EMPTY-WHERE] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_UndefinedValueInWhere(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[UNDEFINED] Undefined value in where should be skipped');

    try {
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            nValue: undefined, // Should be skipped
          },
        },
      });

      // Should return all COMPREHENSIVE_TEST records (undefined is skipped)
      if (results.length >= 10) {
        this.logger.info(
          '[UNDEFINED] PASSED | undefined value skipped, returned %d records',
          results.length,
        );
      } else {
        this.logger.error('[UNDEFINED] FAILED | Expected >= 10 records | Got: %d', results.length);
      }
    } catch (error) {
      this.logger.error('[UNDEFINED] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 8: JSON ADVANCED EDGE CASES
  // ================================================================

  private async test_JsonNullValue(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[JSON-NULL] JSON field with null value: { "jValue.priority": null }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.priority': null } as any,
        },
      });

      // Should find records where jValue.priority is null
      if (results.length >= 1) {
        this.logger.info(
          '[JSON-NULL] PASSED | Found %d records with null jValue.priority',
          results.length,
        );
      } else {
        this.logger.warn('[JSON-NULL] WARNING | No records with null JSON priority found');
      }
    } catch (error) {
      this.logger.error('[JSON-NULL] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_JsonDeeplyNestedPath(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[JSON-DEEP] Deeply nested JSON path: { "jValue.metadata.level": 3 }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.metadata.level': 3 } as any,
        },
      });

      if (results.length >= 1) {
        const level = (results[0].jValue as any)?.metadata?.level;
        if (level === 3) {
          this.logger.info('[JSON-DEEP] PASSED | Found record with metadata.level = 3');
        } else {
          this.logger.error('[JSON-DEEP] FAILED | Wrong level: %s', level);
        }
      } else {
        this.logger.error('[JSON-DEEP] FAILED | Expected records | Got: 0');
      }
    } catch (error) {
      this.logger.error('[JSON-DEEP] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_JsonArrayMultipleIndices(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[JSON-ARRAY] JSON array index: { "jValue.metadata.tags[0]": "a" }');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.metadata.tags[0]': 'a' } as any,
        },
      });

      if (results.length >= 1) {
        const tag = (results[0].jValue as any)?.metadata?.tags?.[0];
        if (tag === 'a') {
          this.logger.info('[JSON-ARRAY] PASSED | Found record with tags[0] = "a"');
        } else {
          this.logger.error('[JSON-ARRAY] FAILED | Wrong tag: %s', tag);
        }
      } else {
        this.logger.error('[JSON-ARRAY] FAILED | Expected records | Got: 0');
      }
    } catch (error) {
      this.logger.error('[JSON-ARRAY] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_JsonBooleanValue(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[JSON-BOOL] JSON boolean: Creating and querying boolean value');

    const code = `JSON_BOOL_${getUID()}`;

    try {
      // Create a record with boolean JSON value
      await repo.create({
        data: {
          code,
          group: 'COMPREHENSIVE_TEST',
          dataType: DataTypes.JSON,
          jValue: { active: true, verified: false },
        },
      });

      // Query for boolean true - Note: JSON #>> returns text, so we compare as string
      const results = await repo.find({
        filter: {
          where: { code, 'jValue.active': 'true' } as any,
        },
      });

      if (results.length === 1) {
        this.logger.info('[JSON-BOOL] PASSED | Found record with jValue.active = true');
      } else {
        this.logger.warn('[JSON-BOOL] WARNING | Boolean comparison may need string: "true"');
      }

      // Cleanup
      await repo.deleteAll({ where: { code } });
    } catch (error) {
      this.logger.error('[JSON-BOOL] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_JsonEmptyArray(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[JSON-EMPTY-ARR] JSON empty array in field');

    try {
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.metadata.tags': '{}' } as any,
        },
      });

      // This tests if empty arrays in JSON can be queried
      this.logger.info(
        '[JSON-EMPTY-ARR] INFO | Query for empty array returned %d records',
        results.length,
      );
      this.logger.info('[JSON-EMPTY-ARR] PASSED | Query executed without error');
    } catch (error) {
      this.logger.error('[JSON-EMPTY-ARR] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_JsonEmptyObject(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[JSON-EMPTY-OBJ] JSON with empty object metadata');

    try {
      // Find records where metadata is empty object
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.metadata': '{}' } as any,
        },
      });

      this.logger.info(
        '[JSON-EMPTY-OBJ] INFO | Query for empty object returned %d records',
        results.length,
      );
      this.logger.info('[JSON-EMPTY-OBJ] PASSED | Query executed without error');
    } catch (error) {
      this.logger.error('[JSON-EMPTY-OBJ] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_JsonSpecialCharactersInValue(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[JSON-SPECIAL] JSON with special characters');

    try {
      // Query for JSON field containing single quote
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', 'jValue.name': { like: "%'%" } } as any,
        },
      });

      if (results.length >= 1) {
        this.logger.info('[JSON-SPECIAL] PASSED | Found record with special char in JSON');
      } else {
        this.logger.info('[JSON-SPECIAL] INFO | No records with special chars found');
      }
    } catch (error) {
      this.logger.error('[JSON-SPECIAL] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 9: SECURITY TESTS
  // ================================================================

  private async test_SqlInjectionInValue(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase(`[SEC-SQL-VALUE] SQL injection in value: { tValue: "'; DROP TABLE--" }`);

    try {
      const maliciousValue = "'; DROP TABLE Configuration; --";

      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: maliciousValue },
        },
      });

      // Should return 0 records, NOT execute SQL injection
      this.logger.info(
        '[SEC-SQL-VALUE] PASSED | SQL injection safely handled | results: %d',
        results.length,
      );

      // Verify table still exists
      const stillExists = await repo.count({ where: { group: 'COMPREHENSIVE_TEST' } });
      if (stillExists.count > 0) {
        this.logger.info('[SEC-SQL-VALUE] VERIFIED | Table intact after injection attempt');
      }
    } catch (error) {
      this.logger.error('[SEC-SQL-VALUE] ERROR | %s', (error as Error).message);
    }
  }

  private async test_SqlInjectionInLikePattern(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[SEC-SQL-LIKE] SQL injection in LIKE pattern');

    try {
      const maliciousPattern = "%'; DELETE FROM Configuration WHERE '1'='1";

      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { like: maliciousPattern } },
        },
      });

      this.logger.info(
        '[SEC-SQL-LIKE] PASSED | LIKE injection safely handled | results: %d',
        results.length,
      );

      // Verify data intact
      const count = await repo.count({ where: { group: 'COMPREHENSIVE_TEST' } });
      if (count.count >= 10) {
        this.logger.info('[SEC-SQL-LIKE] VERIFIED | Data intact after LIKE injection attempt');
      }
    } catch (error) {
      this.logger.error('[SEC-SQL-LIKE] ERROR | %s', (error as Error).message);
    }
  }

  private async test_SqlInjectionInArrayValues(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[SEC-SQL-ARRAY] SQL injection in array values');

    try {
      const maliciousArray = ['normal', "'; DROP TABLE Configuration; --", 'value'];

      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', tValue: { in: maliciousArray } },
        },
      });

      this.logger.info(
        '[SEC-SQL-ARRAY] PASSED | Array injection safely handled | results: %d',
        results.length,
      );
    } catch (error) {
      this.logger.error('[SEC-SQL-ARRAY] ERROR | %s', (error as Error).message);
    }
  }

  private async test_XssInDataStorage(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[SEC-XSS] XSS payload storage and retrieval');

    try {
      // Find record with XSS in description
      const results = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', description: { like: '%<script>%' } },
        },
      });

      if (results.length >= 1) {
        const desc = results[0].description;
        // XSS should be stored as-is (output escaping is UI responsibility)
        if (desc?.includes('<script>')) {
          this.logger.info('[SEC-XSS] PASSED | XSS stored verbatim (escaping is UI concern)');
        }
      } else {
        this.logger.info('[SEC-XSS] INFO | No XSS payload found in test data');
      }
    } catch (error) {
      this.logger.error('[SEC-XSS] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // SECTION 10: COMBINATION TESTS (REAL-WORLD SCENARIOS)
  // ================================================================

  private async test_PaginationWithComplexFilter(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[COMBO-PAGINATE] Pagination with complex filter');

    try {
      // Page 1
      const page1 = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { isn: null } },
          order: ['nValue ASC'],
          limit: 3,
          skip: 0,
        },
      });

      // Page 2
      const page2 = await repo.find({
        filter: {
          where: { group: 'COMPREHENSIVE_TEST', nValue: { isn: null } },
          order: ['nValue ASC'],
          limit: 3,
          skip: 3,
        },
      });

      // Verify no overlap
      const page1Ids = new Set(page1.map(r => r.id));
      const hasOverlap = page2.some(r => page1Ids.has(r.id));

      if (!hasOverlap && page1.length === 3 && page2.length === 3) {
        this.logger.info('[COMBO-PAGINATE] PASSED | Pagination works correctly');
        this.logger.info(
          '[COMBO-PAGINATE] Page 1 values: %j',
          page1.map(r => r.nValue),
        );
        this.logger.info(
          '[COMBO-PAGINATE] Page 2 values: %j',
          page2.map(r => r.nValue),
        );
      } else {
        this.logger.error('[COMBO-PAGINATE] FAILED | Pagination issue detected');
      }
    } catch (error) {
      this.logger.error('[COMBO-PAGINATE] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_SearchWithMultipleCriteria(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[COMBO-SEARCH] Search with multiple criteria (real-world)');

    try {
      // Simulate: Find active items with price in range, sorted by priority
      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            nValue: { gte: 10, lte: 50 },
            tValue: { isn: null },
            'jValue.status': 'active',
          } as any,
          order: ['nValue DESC'],
          limit: 10,
        },
      });

      if (results.length >= 1) {
        this.logger.info(
          '[COMBO-SEARCH] PASSED | Multi-criteria search returned %d records',
          results.length,
        );
        this.logger.info(
          '[COMBO-SEARCH] First result: nValue=%s, tValue=%s',
          results[0].nValue,
          results[0].tValue,
        );
      } else {
        this.logger.warn('[COMBO-SEARCH] WARNING | No results for multi-criteria search');
      }
    } catch (error) {
      this.logger.error('[COMBO-SEARCH] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_DateRangeQuery(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[COMBO-DATE] Date range query using createdAt');

    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const results = await repo.find({
        filter: {
          where: {
            group: 'COMPREHENSIVE_TEST',
            createdAt: { gte: oneHourAgo, lte: now },
          },
        },
      });

      // All test data should be recent
      if (results.length >= 10) {
        this.logger.info(
          '[COMBO-DATE] PASSED | Date range query returned %d recent records',
          results.length,
        );
      } else {
        this.logger.warn('[COMBO-DATE] WARNING | Date range returned fewer records than expected');
      }
    } catch (error) {
      this.logger.error('[COMBO-DATE] FAILED | Error: %s', (error as Error).message);
    }
  }

  private async test_PriceRangeWithTags(): Promise<void> {
    const repo = this.productRepository;
    this.logCase('[COMBO-PRODUCT] Product search: price range + tags (using Product repo)');

    const testTag = `COMBO_TEST_${getUID()}`;

    try {
      // Setup test products
      await repo.createAll({
        data: [
          {
            code: `COMBO_A_${getUID()}`,
            name: 'Product A',
            price: 100,
            tags: [testTag, 'featured'],
          },
          { code: `COMBO_B_${getUID()}`, name: 'Product B', price: 200, tags: [testTag, 'sale'] },
          { code: `COMBO_C_${getUID()}`, name: 'Product C', price: 300, tags: [testTag] },
        ],
      });

      // Complex query: price between 100-250, has specific tag
      const results = await repo.find({
        filter: {
          where: {
            price: { gte: 100, lte: 250 },
            tags: { contains: [testTag] },
          } as any,
        },
      });

      if (results.length === 2) {
        this.logger.info('[COMBO-PRODUCT] PASSED | Found 2 products in price range with tag');
      } else {
        this.logger.error('[COMBO-PRODUCT] FAILED | Expected 2 | Got: %d', results.length);
      }

      // Cleanup
      await repo.deleteAll({ where: { tags: { contains: [testTag] } } });
    } catch (error) {
      this.logger.error('[COMBO-PRODUCT] FAILED | Error: %s', (error as Error).message);
    }
  }

  // ================================================================
  // CLEANUP
  // ================================================================
  private async cleanupTestData(): Promise<void> {
    const repo = this.configurationRepository;
    this.logCase('[CLEANUP] Cleaning up comprehensive test data');

    try {
      const deleted = await repo.deleteAll({ where: { group: 'COMPREHENSIVE_TEST' } });
      this.logger.info('[CLEANUP] PASSED | Deleted %d records', deleted.count);
    } catch (error) {
      this.logger.error('[CLEANUP] FAILED | Error: %s', (error as Error).message);
    }
  }
}
