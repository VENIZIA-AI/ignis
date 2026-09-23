import { service } from '@venizia/ignis';
import { BaseTestService } from '../base-test.service';
import { EdgeCases } from './edge.cases';
import { ScenariosCases } from './scenarios.cases';
import { StrengthsCases } from './strengths.cases';

// ----------------------------------------------------------------
// Row Locking Test Service - Row-level locking (FOR UPDATE) tests
// ----------------------------------------------------------------
@service()
export class RowLockingTestService extends BaseTestService {
  // ----------------------------------------------------------------
  async run(): Promise<void> {
    const context = this.caseContext();
    const strengthsCases = new StrengthsCases(context);
    const scenariosCases = new ScenariosCases(context);
    const edgeCases = new EdgeCases(context);

    this.logSection('[RowLockingTestService] Starting row-level locking test cases...');

    await strengthsCases.case1BasicForUpdate();
    await strengthsCases.case2ForUpdateWithFind();
    await strengthsCases.case3ForUpdateWithFindById();
    await strengthsCases.case4ForShareLock();
    await strengthsCases.case5ForNoKeyUpdate();
    await strengthsCases.case6ForKeyShare();
    await scenariosCases.case7ForUpdateSkipLocked();
    await scenariosCases.case8ForUpdateNoWait();
    await edgeCases.case9LockWithoutTransactionThrows();
    await edgeCases.case10LockWithIncludeThrows();
    await edgeCases.case11LockWithFieldsThrows();
    await scenariosCases.case12LockAndUpdateInTransaction();
    await scenariosCases.case13MultipleReposWithLock();
    await scenariosCases.case14SharedLockAllowsConcurrentReaders();
    await edgeCases.case15LockStrengthsConstants();

    this.logSection('[RowLockingTestService] All row-level locking test cases completed!');
  }
}
