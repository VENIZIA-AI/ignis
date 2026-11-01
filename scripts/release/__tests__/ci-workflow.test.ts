import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const PATH = join(ROOT, '.github/workflows/ci.yml');

interface IWorkflow {
  name?: string;
  'run-name'?: string;
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean | string };
  jobs?: Record<string, unknown>;
}

// The Checks workflow gates a pull request. A release commit goes to develop without one, so a `push`
// trigger would make a release chain pay for a full run per package; a superseded pull request run is
// replaced, a manual run is not. Read as text, held to those few rules.
describe('ci.yml', () => {
  const workflow = existsSync(PATH) ? readFileSync(PATH, 'utf8') : '';
  const parsed = (workflow === '' ? {} : Bun.YAML.parse(workflow)) as IWorkflow;

  test('the workflow exists and has the two gate jobs', () => {
    expect(workflow.length).toBeGreaterThan(0);
    expect(Object.keys(parsed.jobs ?? {}).sort()).toEqual(['build-and-test', 'gates']);
  });

  test('it runs on a pull request to develop or main and on a manual run, and on nothing else', () => {
    expect(Object.keys(parsed.on ?? {}).sort()).toEqual(['pull_request', 'workflow_dispatch']);
    expect(parsed.on?.['pull_request']).toEqual({ branches: ['develop', 'main'] });
  });

  test('it has no push trigger, so a release commit does not start a run', () => {
    expect(parsed.on).not.toHaveProperty('push');
    expect(workflow).not.toMatch(/^\s{2}push:/m);
  });

  test('a newer push to a pull request cancels the older run, a manual run that is running is not cancelled', () => {
    expect(parsed.concurrency?.group).toBe('ci-${{ github.ref }}');
    expect(parsed.concurrency?.['cancel-in-progress']).toBe(
      "${{ github.event_name == 'pull_request' }}",
    );
  });

  test('it only reads the repository, and a pull request run is titled by the pull request', () => {
    expect(parsed.permissions).toEqual({ contents: 'read' });
    expect(parsed['run-name']).toBe('${{ github.event.pull_request.title || github.ref_name }}');
  });
});
