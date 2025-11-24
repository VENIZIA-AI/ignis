import { BaseTestPlan } from './base-test-plan';
import { ITestPlanOptions } from './types';

export class TestPlan<R extends object> extends BaseTestPlan<R> {
  static newInstance<R extends object>(opts: ITestPlanOptions<R>) {
    return new TestPlan<R>(opts);
  }
}
