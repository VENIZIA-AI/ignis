import { ApplicationLogger, LoggerFactory } from '@/helpers/logger';
import { MemoryStorageHelper } from '@/helpers/storage';
import { it } from 'node:test';
import { ITestCase, ITestHooks, ITestPlan, ITestPlanOptions } from './types';

export abstract class BaseTestPlan<R extends object> implements ITestPlan<R> {
  private logger: ApplicationLogger;
  private registry: MemoryStorageHelper<R>;
  private hooks: ITestHooks<R>;
  private testCases: Array<ITestCase<R>>;

  scope: string;

  constructor(opts: ITestPlanOptions<R>) {
    const { scope } = opts;

    this.logger = LoggerFactory.getLogger([scope]);
    this.registry = MemoryStorageHelper.newInstance();

    this.scope = scope;
    this.hooks = opts.hooks ?? {};

    this.testCases = [];

    if (opts.testCases?.length) {
      this.testCases = this.testCases.concat(opts.testCases);
    }

    if (opts.testCaseResolver) {
      const extraTestCases = opts.testCaseResolver({ context: this }) ?? [];
      this.testCases = this.testCases.concat(extraTestCases);
    }
  }

  withTestCases(opts: { testCases: Array<ITestCase<R>> }) {
    this.testCases = opts.testCases;
    return this;
  }

  getTestCases() {
    return this.testCases;
  }

  getHooks() {
    return this.hooks;
  }

  getHook(opts: { key: keyof ITestHooks<R> }) {
    return this.hooks?.[opts.key] ?? null;
  }

  getRegistry() {
    return this.registry;
  }

  getContext() {
    return this;
  }

  bind<T>(opts: { key: string; value: T }) {
    const registry = this.getRegistry();
    registry.set<T>(opts.key, opts.value);
  }

  getSync<T>(opts: { key: keyof R }) {
    const registry = this.getRegistry();
    return registry.get<T>(opts.key);
  }

  execute() {
    this.logger.info('[run] START RUNNING TEST CASE | Total test cases: %s', this.testCases.length);

    if (!this.testCases.length) {
      this.logger.info('[run] Not found test case(s)');
      return;
    }

    for (const testCase of this.testCases) {
      try {
        it(`RUN Test Case | Code: ${testCase.code} | Description: ${testCase.name ? `${testCase.name} - ` : ''}${testCase.description} | Expect: ${testCase.expectation}`, () => {
          return testCase.run();
        });
      } catch (error) {
        this.logger.error('[%s] Failed to finish test case | error: %s', testCase.name, error);
      }
    }
  }
}
