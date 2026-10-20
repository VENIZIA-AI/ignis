import { service } from '@venizia/ignis';
import { BaseTestService } from '../base-test.service';
import { EdgeCases } from './edge.cases';
import { FilteredCases } from './filtered.cases';
import { NestedCases } from './nested.cases';
import { SingleCases } from './single.cases';

// ----------------------------------------------------------------
// Inclusion Test Service - Many-to-many relationship tests
// ----------------------------------------------------------------
@service()
export class InclusionTestService extends BaseTestService {
  // ----------------------------------------------------------------
  async run(): Promise<void> {
    const context = this.caseContext();
    const singleCases = new SingleCases(context);
    const nestedCases = new NestedCases(context);
    const filteredCases = new FilteredCases(context);
    const edgeCases = new EdgeCases(context);

    this.logSection('[InclusionTestService] Starting inclusion test cases (many-to-many)');

    // Basic inclusion tests
    await singleCases.case1SetupAndBasicInclude();
    await singleCases.case2ProductWithSaleChannels();
    await singleCases.case3SaleChannelWithProducts();
    await singleCases.case4JunctionTableWithBothRelations();
    await nestedCases.case5NestedInclusion();

    // Advanced inclusion tests
    await filteredCases.case7ScopedRelationWithFilter();
    await filteredCases.case8ScopedRelationWithOrder();
    await filteredCases.case9ScopedRelationWithLimit();
    await edgeCases.case10EmptyRelationsHandling();
    await edgeCases.case11MultipleRelationsAtSameLevel();
    await filteredCases.case12RelationFieldSelection();
    await nestedCases.case13NestedRelationWithScope();
    await edgeCases.case14FindManyWithInclusions();
    await filteredCases.case15IncludeWithWhereOnParent();

    // Cleanup last
    await edgeCases.case6Cleanup();

    this.logSection('[InclusionTestService] All inclusion test cases completed!');
  }
}
