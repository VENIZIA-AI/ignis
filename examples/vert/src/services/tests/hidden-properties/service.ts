import { service } from '@venizia/ignis';
import { BaseTestService } from '../base-test.service';
import { EdgeCases } from './edge.cases';
import { ReadCases } from './read.cases';
import { RelationsCases } from './relations.cases';
import { WriteCases } from './write.cases';

// ----------------------------------------------------------------
// Hidden Properties Test Service - Hidden field exclusion tests
// ----------------------------------------------------------------
@service()
export class HiddenPropertiesTestService extends BaseTestService {
  // ----------------------------------------------------------------
  async run(): Promise<void> {
    const context = this.caseContext();
    const readCases = new ReadCases(context);
    const writeCases = new WriteCases(context);
    const relationsCases = new RelationsCases(context);
    const edgeCases = new EdgeCases(context);

    this.logSection('[HiddenPropertiesTestService] Starting hidden properties test cases');

    // Basic CRUD tests
    await writeCases.case1CreateUserWithHiddenFields();
    await readCases.case2FindOperationsExcludeHidden(); // Consolidated: findOne, find, findById
    await writeCases.case5UpdateByIdExcludesHidden();

    // Edge cases
    await edgeCases.case7ConnectorQueryReturnsHidden();
    await writeCases.case8CreateAllExcludesHidden();
    await writeCases.case9UpdateAllExcludesHidden();
    await writeCases.case10DeleteByIdExcludesHidden();
    await readCases.case11FieldsSelectionStillExcludesHidden();
    await edgeCases.case12VerifyDataActuallyStoredInDB();

    // Advanced edge cases
    await readCases.case13WhereClauseCanFilterByHidden();
    await readCases.case14CountWithHiddenInWhere();
    await readCases.case15ExistsWithHiddenInWhere();
    await edgeCases.case16TransactionContextHidden();
    // Case 17 removed - redundant with Case 11 (both test field selection with hidden)
    await edgeCases.case18MultipleUsersHiddenExcluded(); // Renamed for clarity
    await writeCases.case19UpdateOnlyHiddenFields();
    await edgeCases.case20NullHiddenFieldValues();

    // Relation hidden properties
    await relationsCases.case21RelationHiddenProperties();

    // Cleanup last
    await edgeCases.case6Cleanup();

    this.logSection('[HiddenPropertiesTestService] All hidden properties test cases completed!');
  }
}
