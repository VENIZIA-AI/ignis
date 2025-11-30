import { ValueOrPromise } from '@/common';
import { getError } from '@/helpers/error';
import assert from 'node:assert';
import { ApplicationLogger, LoggerFactory } from '../logger';
import { TestCaseDecisions } from './common';
import { ITestCaseHandler, ITestCaseInput, ITestContext, TTestCaseDecision } from './types';

export interface ITestCaseHandlerOptions<R extends object, I extends ITestCaseInput = {}> {
  scope?: string;
  context: ITestContext<R>;

  args?: I | null;
  argResolver?: (...args: any[]) => I | null;

  validator?: (opts: any) => ValueOrPromise<TTestCaseDecision>;
}

export abstract class BaseTestCaseHandler<R extends object = {}, I extends ITestCaseInput = {}>
  implements ITestCaseHandler<R, I>
{
  protected logger: ApplicationLogger;

  context: ITestContext<R>;
  args: I | null;

  validator?: (opts: any) => ValueOrPromise<TTestCaseDecision>;

  constructor(opts: ITestCaseHandlerOptions<R, I>) {
    this.logger = LoggerFactory.getLogger([opts?.scope ?? BaseTestCaseHandler.name]);

    this.context = opts.context;
    this.args = opts.args ?? opts.argResolver?.() ?? null;
    this.validator = opts?.validator;
  }

  getArguments() {
    return this.args;
  }

  abstract execute(): ValueOrPromise<any>;

  abstract getValidator():
    | ((opts: Awaited<ReturnType<typeof this.execute>>) => ValueOrPromise<TTestCaseDecision>)
    | null;
  abstract validate(opts: any): ValueOrPromise<TTestCaseDecision>;
}

export abstract class TestCaseHandler<
  R extends object = {},
  I extends ITestCaseInput = {},
> extends BaseTestCaseHandler<R, I> {
  constructor(opts: ITestCaseHandlerOptions<R, I>) {
    super({
      ...opts,
      scope: opts.scope ?? TestCaseHandler.name,
    });
  }

  async _execute() {
    let validateRs = TestCaseDecisions.UNKNOWN;

    try {
      const executeRs = await this.execute();
      validateRs = await this.validate(executeRs);
    } catch (error) {
      this.logger.error('[_execute] Failed to execute test handler | Error: %s', error);
    }

    assert.equal(validateRs, TestCaseDecisions.SUCCESS);
  }

  validate(opts: any): ValueOrPromise<TTestCaseDecision> {
    const validator = this.validator ?? this.getValidator();

    if (!validator) {
      throw getError({
        message: '[validate] Invalid test case validator!',
      });
    }

    return validator(opts) ?? TestCaseDecisions.UNKNOWN;
  }
}
