import { BindingKeys, BindingNamespaces, inject } from '@venizia/ignis';
import {
  ConfigurationRepository,
  ProductRepository,
  SaleChannelProductRepository,
  SaleChannelRepository,
  UserRepository,
} from '../../../repositories';
import { BaseTestService } from '../base-test.service';
import { ArrayCases } from './array.cases';
import { CombinedCases } from './combined.cases';
import { ComparisonCases } from './comparison.cases';
import { LogicalCases } from './logical.cases';
import { NullAndBooleanCases } from './null-and-boolean.cases';
import { StringCases } from './string.cases';
import { OperatorTestFixture } from './support';

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
    const context = this.caseContext();
    const fixture = new OperatorTestFixture(context);
    const comparisonCases = new ComparisonCases(context);
    const nullAndBooleanCases = new NullAndBooleanCases(context);
    const stringCases = new StringCases(context);
    const arrayCases = new ArrayCases(context);
    const logicalCases = new LogicalCases(context);
    const combinedCases = new CombinedCases(context);

    this.logSection('[ComprehensiveOperatorTestService] Starting comprehensive operator tests');

    // Setup
    await fixture.setupTestData();

    // ================================================================
    // SECTION 1: ALL COMPARISON OPERATORS
    // ================================================================
    await comparisonCases.testEqOperatorExplicit();
    await comparisonCases.testNeOperator();
    await comparisonCases.testNeqOperatorAlias();
    await comparisonCases.testGtOperator();
    await comparisonCases.testGteOperator();
    await comparisonCases.testLtOperator();
    await comparisonCases.testLteOperator();

    // ================================================================
    // SECTION 2: NULL OPERATORS (IS / ISN)
    // ================================================================
    await nullAndBooleanCases.testIsNullOperator();
    await nullAndBooleanCases.testIsNotNullOperator();
    await nullAndBooleanCases.testNullWithEqOperator();
    await nullAndBooleanCases.testNullWithNeqOperator();

    // ================================================================
    // SECTION 3: STRING OPERATORS
    // ================================================================
    await stringCases.testLikeOperator();
    await stringCases.testNotLikeOperator();
    await stringCases.testIlikeOperator();
    await stringCases.testNotIlikeOperator();
    await stringCases.testRegexpOperator();
    await stringCases.testIregexpOperator();

    // ================================================================
    // SECTION 4: ARRAY/LIST OPERATORS
    // ================================================================
    await arrayCases.testInOperator();
    await arrayCases.testInqOperatorAlias();
    await arrayCases.testNinOperator();
    await arrayCases.testInEmptyArrayEdgeCase();
    await arrayCases.testNinEmptyArrayEdgeCase();
    await arrayCases.testBetweenOperator();
    await arrayCases.testNotBetweenOperator();

    // ================================================================
    // SECTION 5: MULTIPLE OPERATORS ON SAME FIELD
    // ================================================================
    await comparisonCases.testMultipleOperatorsSameField();
    await comparisonCases.testRangeQueryGtAndLt();

    // ================================================================
    // SECTION 6: COMPLEX LOGICAL OPERATIONS
    // ================================================================
    await logicalCases.testNestedAndOr();
    await logicalCases.testDeeplyNestedLogic();
    await logicalCases.testOrWithMultipleConditions();
    await logicalCases.testAndWithOrInside();

    // ================================================================
    // SECTION 7: EDGE CASES
    // ================================================================
    await stringCases.testEmptyStringEquality();
    await stringCases.testSpecialCharactersInLike();
    await combinedCases.testLargeNumberBoundary();
    await combinedCases.testNegativeNumbers();
    await combinedCases.testZeroValue();
    await combinedCases.testSkipBeyondDataset();
    await combinedCases.testLimitZero();
    await logicalCases.testEmptyWhereClause();
    await logicalCases.testUndefinedValueInWhere();

    // ================================================================
    // SECTION 8: JSON ADVANCED EDGE CASES
    // ================================================================
    await nullAndBooleanCases.testJsonNullValue();
    await combinedCases.testJsonDeeplyNestedPath();
    await arrayCases.testJsonArrayMultipleIndices();
    await nullAndBooleanCases.testJsonBooleanValue();
    await arrayCases.testJsonEmptyArray();
    await combinedCases.testJsonEmptyObject();
    await stringCases.testJsonSpecialCharactersInValue();

    // ================================================================
    // SECTION 9: SECURITY TESTS
    // ================================================================
    await combinedCases.testSqlInjectionInValue();
    await combinedCases.testSqlInjectionInLikePattern();
    await combinedCases.testSqlInjectionInArrayValues();
    await combinedCases.testXssInDataStorage();

    // ================================================================
    // SECTION 10: COMBINATION TESTS (REAL-WORLD SCENARIOS)
    // ================================================================
    await combinedCases.testPaginationWithComplexFilter();
    await combinedCases.testSearchWithMultipleCriteria();
    await combinedCases.testDateRangeQuery();
    await combinedCases.testPriceRangeWithTags();

    // Cleanup
    await fixture.cleanupTestData();

    this.logSection('[ComprehensiveOperatorTestService] All tests completed!');
  }
}
