import { service } from '@venizia/ignis';
import { BaseTestService } from '../base-test.service';
import { ArraysCases } from './arrays.cases';
import { EdgeCases } from './edge.cases';
import { OperatorsCases } from './operators.cases';
import { PathCases } from './path.cases';

// ----------------------------------------------------------------
// JSON Filter Test Service - JSON/JSONB path filtering tests
// ----------------------------------------------------------------
@service()
export class JsonFilterTestService extends BaseTestService {
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
