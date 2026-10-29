import { runInNewContext } from 'node:vm';

export interface IPublishCase {
  name: string;
  kind: string;
  approve: string;
  plan?: string;
  test?: string;
  scripts?: string;
  isCancelled?: boolean;
  /** Whether the publish job must run. */
  expected: boolean;
}

/**
 * The `if:` of the publish job, evaluated the way Actions does for the results a case gives it. The cases are the
 * claim: a prerelease publishes with `approve` skipped, a stable only after `approve` succeeded, and a failed or
 * cancelled dependency (the plan, the package tests or the script tests) stops either. Adapted from VULCAN's
 * `scripts/checks/publish-condition.ts` (fe4c6771) with the `scripts` job IGNIS has and VULCAN has not.
 */
export class ReleasePublishCondition {
  static readonly CASES: IPublishCase[] = [
    {
      name: 'a prerelease publishes with approve skipped',
      kind: 'prerelease',
      approve: 'skipped',
      expected: true,
    },
    {
      name: 'a stable publishes after approve succeeded',
      kind: 'stable',
      approve: 'success',
      expected: true,
    },
    {
      name: 'a stable with approve skipped does not publish',
      kind: 'stable',
      approve: 'skipped',
      expected: false,
    },
    {
      name: 'a stable with approve failed does not publish',
      kind: 'stable',
      approve: 'failure',
      expected: false,
    },
    {
      name: 'a stable with approve cancelled does not publish',
      kind: 'stable',
      approve: 'cancelled',
      expected: false,
    },
    {
      name: 'a failed plan stops a prerelease',
      kind: 'prerelease',
      approve: 'skipped',
      plan: 'failure',
      expected: false,
    },
    {
      name: 'failed package tests stop a prerelease',
      kind: 'prerelease',
      approve: 'skipped',
      test: 'failure',
      expected: false,
    },
    {
      name: 'failed package tests stop a stable',
      kind: 'stable',
      approve: 'success',
      test: 'failure',
      expected: false,
    },
    {
      name: 'failed script tests stop a prerelease',
      kind: 'prerelease',
      approve: 'skipped',
      scripts: 'failure',
      expected: false,
    },
    {
      name: 'failed script tests stop a stable',
      kind: 'stable',
      approve: 'success',
      scripts: 'failure',
      expected: false,
    },
    {
      name: 'skipped script tests stop a stable',
      kind: 'stable',
      approve: 'success',
      scripts: 'skipped',
      expected: false,
    },
    {
      name: 'a cancelled run does not publish a prerelease',
      kind: 'prerelease',
      approve: 'skipped',
      isCancelled: true,
      expected: false,
    },
    {
      name: 'a cancelled run does not publish a stable',
      kind: 'stable',
      approve: 'success',
      isCancelled: true,
      expected: false,
    },
    { name: 'an unknown kind does not publish', kind: '', approve: 'skipped', expected: false },
  ];

  /** The expression without its `${{ }}` wrapper and without line breaks. */
  static expressionOf(opts: { condition: string }): string {
    return opts.condition
      .replace(/^\$\{\{\s*/, '')
      .replace(/\s*\}\}$/, '')
      .replace(/\s+/g, ' ');
  }

  /** Whether the job runs for this case; `undefined` when the expression cannot be evaluated at all. */
  static runs(opts: { condition: string; testCase: IPublishCase }): boolean | undefined {
    const { testCase } = opts;
    let outcome: unknown;

    try {
      outcome = runInNewContext(this.expressionOf({ condition: opts.condition }), {
        cancelled: () => testCase.isCancelled === true,
        needs: {
          plan: { result: testCase.plan ?? 'success', outputs: { kind: testCase.kind } },
          test: { result: testCase.test ?? 'success' },
          scripts: { result: testCase.scripts ?? 'success' },
          approve: { result: testCase.approve },
        },
      });
    } catch {
      return undefined;
    }

    return typeof outcome === 'boolean' ? outcome : undefined;
  }

  /** The cases the condition gets wrong, by name; every case when it cannot be evaluated. */
  static failures(opts: { condition: string }): string[] {
    return this.CASES.filter(
      (testCase) => this.runs({ condition: opts.condition, testCase }) !== testCase.expected,
    ).map((testCase) => testCase.name);
  }
}
