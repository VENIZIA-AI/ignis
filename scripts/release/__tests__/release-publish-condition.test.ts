import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReleasePublishCondition } from '../release-publish-condition';

const WORKFLOW = readFileSync(
  resolve(import.meta.dir, '..', '..', '..', '.github/workflows/package-release.yml'),
  'utf8',
);
const CONDITION = (Bun.YAML.parse(WORKFLOW) as { jobs: { publish: { if: string } } }).jobs.publish
  .if;

describe('ReleasePublishCondition', () => {
  test('the committed publish condition is right for every case', () => {
    expect(ReleasePublishCondition.failures({ condition: CONDITION })).toEqual([]);
  });

  test('a condition that ignores the approval of a stable is wrong for exactly the cases that depend on it', () => {
    const failures = ReleasePublishCondition.failures({
      condition: "${{ !cancelled() && needs.plan.result == 'success' }}",
    });

    expect(failures).toContain('a stable with approve skipped does not publish');
    expect(failures).toContain('failed package tests stop a prerelease');
    expect(failures).not.toContain('a prerelease publishes with approve skipped');
  });

  test('an expression that cannot be evaluated is wrong for every case', () => {
    expect(ReleasePublishCondition.failures({ condition: '${{ nonsense( }}' })).toHaveLength(
      ReleasePublishCondition.CASES.length,
    );
  });

  test('a condition that is not a boolean is wrong for every case', () => {
    expect(
      ReleasePublishCondition.runs({
        condition: '${{ needs.plan.outputs.kind }}',
        testCase: ReleasePublishCondition.CASES[0],
      }),
    ).toBeUndefined();
  });
});
