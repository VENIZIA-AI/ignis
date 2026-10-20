import { service } from '@venizia/ignis';
import { BaseTestService } from '../base-test.service';
import { CreateCases } from './create.cases';
import { DeleteCases } from './delete.cases';
import { ReadCases } from './read.cases';
import { UpdateCases } from './update.cases';
import { ValueCases } from './values.cases';

// ----------------------------------------------------------------
// CRUD Test Service - Basic repository operations (no transaction)
// ----------------------------------------------------------------
@service()
export class CrudTestService extends BaseTestService {
  // ----------------------------------------------------------------
  async run(): Promise<void> {
    const context = this.caseContext();
    const createCases = new CreateCases(context);
    const readCases = new ReadCases(context);
    const updateCases = new UpdateCases(context);
    const deleteCases = new DeleteCases(context);
    const valueCases = new ValueCases(context);

    this.logSection('[CrudTestService] Starting repository test cases (no transaction)');

    // Basic CRUD operations
    await createCases.case1CreateSingle();
    await createCases.case2CreateAll();
    await readCases.case3FindOne();
    await readCases.case4FindWithFilter();
    await readCases.case5FindById();
    await updateCases.case6UpdateById();
    await updateCases.case7UpdateAll();
    await deleteCases.case8DeleteByIdAndDeleteAll();

    // Edge cases and error handling
    await createCases.case9CreateWithNullValues();
    await createCases.case10EmptyBatchCreate();
    await updateCases.case11UpdateNonExistentRecord();
    await deleteCases.case12DeleteNonExistentRecord();
    await valueCases.case13BoundaryValues();
    await readCases.case14CountOperation();
    await readCases.case15ExistsWithOperation();
    await createCases.case16ConcurrentCreates();
    await updateCases.case17UpdateWithPartialData();
    await readCases.case18FindWithEmptyResult();
    await valueCases.case19DoublePrecisionValues();

    this.logSection('[CrudTestService] All repository test cases completed');
  }
}
